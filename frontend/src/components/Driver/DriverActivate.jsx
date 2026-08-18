import DriverLeftPanel from "./DriverLeftPanel";
import RightPanel from "../RightPanel";

export default function DriverActivate() {
  return (
    <div className="flex h-full flex-col overflow-hidden sm:flex-row">
      <DriverLeftPanel />
      <RightPanel />
    </div>
  );
}
