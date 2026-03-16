"use client";

import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Textarea } from "./ui/textarea";
import { ArrowUpIcon } from "lucide-react";
import { askAIAboutNotesAction } from "@/actions/notes";
import useNote from "@/hooks/useNote";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../styles/ai-response.css";

type Props = {
  user: User | null;
};

export function AskAIButton({ user }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { noteText } = useNote();

  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [qustionText, setQuestionText] = useState("");
  const [qustions, setQuestions] = useState<string[]>([]);
  const [responses, setResponses] = useState<string[]>([]);
  const currentNoteId = searchParams.get("noteId");

  const shouldAutoOpen = searchParams.get("ask") === "1";

  const handleOnOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!user) {
        router.push("/login");
      } else {
        if (isOpen) {
          setQuestionText("");
          setQuestions([]);
          setResponses([]);
        }
        setOpen(isOpen);
      }
    },
    [router, user],
  );

  useEffect(() => {
    if (!shouldAutoOpen) return;

    if (!user) {
      router.push("/login");
      return;
    }

    handleOnOpenChange(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("ask");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [handleOnOpenChange, pathname, router, searchParams, shouldAutoOpen, user]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleClickInput = () => {
    textareaRef.current?.focus();
  };

  const handleSubmit = () => {
    if (!qustionText.trim()) return;

    const newQuestions = [...qustions, qustionText];
    setQuestions(newQuestions);
    setQuestionText("");
    setTimeout(scrollToBottom, 100);

    startTransition(async () => {
      try {
        const response = await askAIAboutNotesAction(
          newQuestions,
          responses,
          currentNoteId,
          noteText,
        );
        setResponses((prev) => [...prev, response]);
      } catch (error) {
        console.error(error);
        setResponses((prev) => [
          ...prev,
          "**AI request failed.** Please try again later.",
        ]);
      }

      setTimeout(scrollToBottom, 100);
    });
  };

  const scrollToBottom = () => {
    contentRef.current?.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOnOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">Ask DeepSeek</Button>
      </DialogTrigger>

      <DialogContent
        className="custom-scrollbar flex h-[85vh] max-w-4xl flex-col overflow-y-auto"
        ref={contentRef}
      >
        <DialogHeader>
          <DialogTitle>Ask DeepSeek About Your Notes</DialogTitle>
          <DialogDescription>
            Our AI can answer questions about your notes.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-8">
          {qustions.map((qustion, index) => (
            <Fragment key={index}>
              <p className="bg-muted text-muted-foreground ml-auto max-w-[60%] rounded-md px-2">
                {qustion}
              </p>
              {responses[index] && (
                <div className="bot-response text-muted-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {responses[index]}
                  </ReactMarkdown>
                </div>
              )}
            </Fragment>
          ))}
          {isPending && <p className="animate-pulse text-sm">Thinking...</p>}
        </div>

        <div className="bg-muted/40 mt-4 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            Current Note Context
          </p>
          <p className="text-muted-foreground mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm">
            {noteText?.trim()
              ? noteText
              : "No content in the selected note yet. Add some text and ask again."}
          </p>
        </div>

        <div
          className="mt-auto flex cursor-text flex-col rounded-lg border p-4"
          onClick={handleClickInput}
        >
          <Textarea
            ref={textareaRef}
            placeholder="Ask me anything about your notes..."
            className="resize-none rounded-none border-none bg-transparent p-0 shadow-none focus:ring-0 focus-visible:ring-offset-0"
            style={{
              minHeight: "0",
              lineHeight: "normal",
            }}
            rows={1}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            value={qustionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />

          <Button
            type="button"
            className="ml-auto size-8 rounded-full"
            onClick={handleSubmit}
            disabled={isPending}
          >
            <ArrowUpIcon className="text-background" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
