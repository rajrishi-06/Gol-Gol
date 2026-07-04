import DriverLeftPanel from "./DriverLeftPanel";
import RightPanel from "../RightPanel";

export default function DriverActivate() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <DriverLeftPanel />
      <RightPanel />
    </div>
  );
}
