import TopBar from "./TopBar";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { cn } from "../../lib/cn";

/**
 * Standard content page inside the shell: one header, one scroll container, a
 * readable measure. Screens stop reinventing their own layout (and their own
 * `h-[100dvh]`, which fought the shell) and just describe their content.
 */
export default function Page({
  title,
  subtitle,
  documentTitle,
  back = false,
  actions,
  width = "md",
  className,
  children,
}) {
  useDocumentTitle(documentTitle ?? title);

  const measure = {
    sm: "max-w-xl",
    md: "max-w-3xl",
    lg: "max-w-5xl",
    full: "max-w-none",
  }[width];

  return (
    <div className="flex h-full flex-col">
      <TopBar title={title} subtitle={subtitle} back={back} actions={actions} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn("mx-auto w-full px-4 py-5 sm:px-6 sm:py-7", measure, className)}>
          {children}
        </div>
      </div>
    </div>
  );
}
