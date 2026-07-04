import { CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "../../lib/cn";

const config = {
  success: { cls: "bg-success-subtle text-success-fg", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-subtle text-warning-fg", Icon: AlertTriangle },
  danger: { cls: "bg-danger-subtle text-danger-fg", Icon: XCircle },
  info: { cls: "bg-primary-subtle text-primary-subtle-fg", Icon: Info },
};

/** Inline status banner. Replaces `alert()` calls with accessible messaging. */
export default function Alert({ tone = "info", title, children, className }) {
  const { cls, Icon } = config[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl p-3.5 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
