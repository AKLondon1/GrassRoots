import { ShieldAlert } from "lucide-react";

import { StateMessage, type StateMessageProps } from "@/components/ui/state-message";

type DeniedStateProps = Omit<StateMessageProps, "description" | "icon" | "tone"> & {
  description?: string;
};

function DeniedState({
  description = "Your current role does not include permission to see this information.",
  ...props
}: DeniedStateProps) {
  return (
    <StateMessage
      description={description}
      icon={ShieldAlert}
      tone="info"
      {...props}
    />
  );
}

export { DeniedState };
