"use client";

import { CircleAlert } from "lucide-react";

import { StateMessage, type StateMessageProps } from "@/components/ui/state-message";

type ErrorStateProps = Omit<StateMessageProps, "description" | "icon" | "tone"> & {
  description?: string;
};

function ErrorState({
  description = "Something went wrong. Try again, or come back in a few minutes.",
  ...props
}: ErrorStateProps) {
  return (
    <StateMessage
      description={description}
      icon={CircleAlert}
      tone="danger"
      {...props}
    />
  );
}

export { ErrorState };
