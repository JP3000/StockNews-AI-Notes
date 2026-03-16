"src/app/page.tsx";
import React from "react";
import { getUser } from "@/auth/server";
import { AskAIButton } from "@/components/AskAIButton";
import NewNoteButton from "@/components/NewNoteButton";
import NoteTextInput from "@/components/NoteTextInput";
import { prisma } from "@/db/prisma";
import StockInfo from "@/components/stockInfo";
import { StockNews } from "@/components/stockNews";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function HomePage({ searchParams }: Props) {
  const noteIdParam = (await searchParams).noteId;
  const user = await getUser();

  const noteId = Array.isArray(noteIdParam)
    ? noteIdParam![0]
    : noteIdParam || "";

  const note = await prisma.note.findUnique({
    where: {
      id: noteId,
      authorId: user?.id,
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pb-4">
      <div className="grid h-full min-h-0 w-full grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-h-0">
          <StockInfo />
        </div>

        <div className="min-h-0">
          <StockNews limit={20} className="h-full" />
        </div>

        <div className="min-h-0">
          <div className="bg-card flex h-full min-h-[620px] flex-col rounded-lg border p-4 shadow-sm">
            <h2 className="text-base font-semibold">笔记输入</h2>
            <p className="text-muted-foreground mt-1 text-xs">随时记录你的分析观点和交易想法</p>
            <div className="mt-3 min-h-0 flex-1">
              <NoteTextInput
                noteId={noteId}
                startingNoteText={note?.text || ""}
                className="h-full"
                textareaClassName="h-full min-h-[500px]"
              />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
              <AskAIButton user={user} />
              <NewNoteButton user={user} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
