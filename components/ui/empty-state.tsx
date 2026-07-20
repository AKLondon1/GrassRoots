import { CalendarPlus } from "lucide-react";

import { StateMessage, type StateMessageProps } from "@/components/ui/state-message";

type EmptyStateProps = Omit<StateMessageProps, "description" | "icon" | "tone"> & {
  description?: string;
};

function EmptyState({
  description = "There is nothing here yet. Add the first item when you are ready.",
  ...props
}: EmptyStateProps) {
  return (
    <StateMessage
      description={description}
      icon={CalendarPlus}
      tone="neutral"
      {...props}
    />
  );
}

export { EmptyState };
