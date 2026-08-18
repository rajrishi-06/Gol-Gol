import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useBooking } from "../lib/booking.jsx";
import TopBar from "./layout/TopBar";
import BookLeft from "./BookLeft";
import BookRight from "./BookRight";

/** Confirm-and-book screen: trip summary on the left, route preview on the right. */
export default function Book() {
  useDocumentTitle("Confirm your ride");
  const { fromCords, toCords } = useBooking();

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Confirm your ride" back />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        <BookLeft />
        <BookRight fromCords={fromCords} toCords={toCords} />
      </div>
    </div>
  );
}
