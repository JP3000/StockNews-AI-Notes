"use client";

import { useSearchParams } from "next/navigation";
import { Textarea } from "./ui/textarea";
import { ChangeEvent, useEffect } from "react";
import { debounceTimeout } from "@/lib/constants";
import useNote from "@/hooks/useNote";
import { updateNoteAction } from "@/actions/notes";
import { cn } from "@/lib/utils";

type Props = {
  noteId: string;
  startingNoteText: string;
  className?: string;
  textareaClassName?: string;
};

let updateTimeout: NodeJS.Timeout;

export default function NoteTextInput({
  noteId,
  startingNoteText,
  className,
  textareaClassName,
}: Props) {
  const noteIdParam = useSearchParams().get("noteId") || "";
  const { noteText, setNoteText } = useNote();

  useEffect(() => {
    if (noteIdParam === noteId) {
      setNoteText(startingNoteText);
    }
  }, [noteIdParam, noteId, startingNoteText, setNoteText]);

  const handleUpdateNote = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    // console.log(text);

    setNoteText(text);

    clearTimeout(updateTimeout);

    updateTimeout = setTimeout(() => {
      updateNoteAction(noteId, text);
    }, debounceTimeout);
  };

  return (
    <div className={cn("h-full", className)}>
      <Textarea
        value={noteText}
        onChange={handleUpdateNote}
        placeholder="Type your note here..."
        className={cn(
          "custom-scrollbar placeholder:text-muted-foreground h-full w-full resize-none border p-4 focus-visible:ring-0 focus-visible:ring-offset-0",
          textareaClassName,
        )}
      />
    </div>
  );
}
