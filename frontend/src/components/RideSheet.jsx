import { Drawer } from "vaul";
import { useMediaQuery } from "../lib/useMediaQuery";

/**
 * Ride-screen shell. On desktop it's a side panel next to a full-height map;
 * on mobile it's a map-first layout with a draggable bottom sheet (Vaul) that
 * snaps between a peek and near-full height — the ride-hailing pattern. The
 * sheet is non-modal so the map stays pannable behind it, and non-dismissible
 * so ride details can always be pulled back up.
 */
export default function RideSheet({ map, title = "Ride details", children }) {
  const isMobile = useMediaQuery("(max-width: 639px)");

  if (!isMobile) {
    return (
      <div className="flex h-full overflow-hidden">
        <aside className="flex w-[500px] shrink-0 flex-col overflow-y-auto border-r border-border bg-background px-6 py-6 lg:w-[540px]">
          {children}
        </aside>
        <div className="relative flex-1">{map}</div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0">{map}</div>
      <Drawer.Root open onOpenChange={() => {}} modal={false} dismissible={false} snapPoints={[0.4, 0.94]}>
        <Drawer.Portal>
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-40 flex h-[94vh] flex-col rounded-t-3xl border-t border-border bg-background shadow-floating outline-none"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            <div className="flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-8 pt-3">
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
