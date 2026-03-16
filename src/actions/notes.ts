"use server";

import { getUser } from "@/auth/server";
import { prisma } from "@/db/prisma";
import { handleError } from "@/lib/utils";
import openai from "@/deepSeek";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

function escapeMarkdown(input: string) {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function getAIServiceErrorMessage(error: unknown) {
  if (!(error && typeof error === "object")) {
    return "AI service is temporarily unavailable.";
  }

  const maybeError = error as {
    status?: number;
    code?: string;
    message?: string;
    error?: { code?: string; message?: string };
  };

  const status = maybeError.status;
  const code = maybeError.code || maybeError.error?.code || "";
  const message = (maybeError.message || maybeError.error?.message || "").toLowerCase();

  if (
    status === 403 &&
    (code === "unsupported_country_region_territory" ||
      message.includes("country") ||
      message.includes("region") ||
      message.includes("territory"))
  ) {
    return "AI provider rejected this request due to region restrictions.";
  }

  if (status === 401) {
    return "AI provider authentication failed. Please check DEEPSEEK_API_KEY.";
  }

  if (status === 429) {
    return "AI provider rate limit reached. Please retry shortly.";
  }

  return "AI service is temporarily unavailable.";
}

function buildLocalFallbackReply(noteText: string, latestQuestion: string, reason: string) {
  const lines = noteText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = lines.find((line) => line.toLowerCase().startsWith("title:"));
  const urlLine = lines.find((line) => line.toLowerCase().startsWith("url:"));
  const bodyLines = lines.filter(
    (line) => !line.toLowerCase().startsWith("title:") && !line.toLowerCase().startsWith("url:"),
  );

  const title = titleLine?.replace(/^title:\s*/i, "") || "Current note";
  const sourceUrl = urlLine?.replace(/^url:\s*/i, "");
  const bullets = bodyLines.slice(0, 3);

  const fallbackPoints =
    bullets.length > 0
      ? bullets.map((item) => `- ${escapeMarkdown(item)}`)
      : [
          `- ${escapeMarkdown(noteText.slice(0, 260))}${
            noteText.length > 260 ? "..." : ""
          }`,
        ];

  return [
    `> ${escapeMarkdown(reason)}`,
    "",
    "## Local Brief",
    `- **Title:** ${escapeMarkdown(title)}`,
    ...(sourceUrl
      ? [
          `- **Source:** [${escapeMarkdown(sourceUrl)}](${sourceUrl})`,
        ]
      : []),
    "",
    "### Key Points",
    ...fallbackPoints,
    ...(latestQuestion
      ? [
          "",
          "### Your Question",
          escapeMarkdown(latestQuestion),
        ]
      : []),
    "",
    "_Tip: You can continue asking follow-up questions based on this note context._",
  ].join("\n");
}

export const createNoteAction = async (noteId: string) => {
  try {
    const user = await getUser();
    if (!user) throw new Error("You must be logged in to create a note");

    await prisma.note.create({
      data: {
        id: noteId,
        authorId: user.id,
        text: "",
      },
    });

    return { errorMessage: null };
  } catch (error) {
    return handleError(error);
  }
};

export const updateNoteAction = async (noteId: string, text: string) => {
  try {
    const user = await getUser();
    if (!user) throw new Error("You must be logged in to update a note");

    await prisma.note.update({
      where: { id: noteId },
      data: { text },
    });

    return { errorMessage: null };
  } catch (error) {
    return handleError(error);
  }
};

export const deleteNoteAction = async (noteId: string) => {
  try {
    const user = await getUser();
    if (!user) throw new Error("You must be logged in to delete a note");

    await prisma.note.delete({
      where: { id: noteId, authorId: user.id },
    });

    return { errorMessage: null };
  } catch (error) {
    return handleError(error);
  }
};

export const askAIAboutNotesAction = async (
  newQuestions: string[],
  responses: string[],
  currentNoteId: string | null,
  currentNoteText: string,
) => {
  try {
    const user = await getUser();
    if (!user) throw new Error("You must be logged in to ask AI questions");

    if (!currentNoteId) {
      return "Please select a note first, then ask your question.";
    }

    const currentNote = await prisma.note.findFirst({
      where: {
        id: currentNoteId,
        authorId: user.id,
      },
      select: {
        text: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const noteTextForContext = (currentNoteText || currentNote?.text || "").trim();

    if (!noteTextForContext) {
      return "The selected note is empty. Add some note content first.";
    }

    const titleLine =
      noteTextForContext
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.toLowerCase().startsWith("title:")) || "";
    const sourceLine =
      noteTextForContext
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.toLowerCase().startsWith("url:")) || "";

    const noteTitle = titleLine.replace(/^title:\s*/i, "") || "Untitled Note";
    const noteSourceUrl = sourceLine.replace(/^url:\s*/i, "");
    const safeNoteTextForPrompt = noteTextForContext.replace(/```/g, "'''");

    const selectedNoteContext = [
      `Title: ${noteTitle}`,
      ...(noteSourceUrl ? [`Source URL: ${noteSourceUrl}`] : []),
      `Created At: ${new Date(currentNote?.createdAt || Date.now()).toLocaleDateString()}`,
      ...(currentNote?.updatedAt && currentNote.updatedAt !== currentNote.createdAt
        ? [`Updated At: ${new Date(currentNote.updatedAt).toLocaleDateString()}`]
        : []),
      "Raw Note Content:",
      "```text",
      safeNoteTextForPrompt,
      "```",
    ].join("\n");

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `
You are FinSight, a senior financial analysis assistant focused on equities, sectors, macro drivers, and risk control.
You must answer based on ONE selected note and the current user question.

Core rules:
1. Use only facts present in the selected note or prior chat turns.
2. If a fact is missing, explicitly write: "Not provided in the selected note".
3. Keep output concise, evidence-driven, and actionable.
4. Do not fabricate data or guarantee returns.
5. Respond in Simplified Chinese unless the user asks otherwise.
6. Output valid Markdown only. Never output HTML tags.

Required response structure:
## 结论摘要
- 3 to 5 concise bullets.

## 核心逻辑
- Explain key drivers, assumptions, and transmission paths.

## 关键数据与证据
| 项目 | 信息 | 来源 |
|---|---|---|
| ... | ... | 选中笔记 |

## 风险与反证
- List downside risks and what would invalidate the view.

## 跟踪清单
- [ ] Provide 3 to 6 measurable follow-up checks.

Optional when relevant:
## 情景比较
| 情景 | 触发条件 | 影响 | 应对思路 |
|---|---|---|---|

Selected note context:
${selectedNoteContext}
        `.replace(/\n\s+/g, '\n').trim(),
      }
    ];


    for (let i = 0; i < newQuestions.length; i++) {
      messages.push({ role: "user", content: newQuestions[i] });
      if (responses.length > i) {
        messages.push({ role: "assistant", content: responses[i] });
      }
    }

    const completion = await openai.chat.completions.create({
      messages,
      model: "deepseek-chat",
    });

    return completion.choices[0].message.content || "A problem has occurred";
  } catch (error) {
    console.error("askAIAboutNotesAction failed", error);

    const noteTextForFallback = (currentNoteText || "").trim();
    if (!noteTextForFallback) {
      return "AI service is unavailable right now, and the selected note is empty.";
    }

    const latestQuestion = newQuestions[newQuestions.length - 1] || "";
    const reason = getAIServiceErrorMessage(error);
    return buildLocalFallbackReply(noteTextForFallback, latestQuestion, reason);
  }
};