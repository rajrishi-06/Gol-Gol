import { useLocation } from "react-router-dom";
import BookLeft from "./BookLeft";
import BookRight from "./BookRight";

export default function Book() {
  const { state } = useLocation();
  const fromCords = state?.fromCords;
  const toCords = state?.toCords;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden sm:flex-row">
      <BookLeft />
      <BookRight fromCords={fromCords} toCords={toCords} />
    </div>
  );
}
