import { redirect } from "next/navigation";

// Home (built ahead of schedule) now fulfills the spec's "opens to Today when a
// trip is active, else Trips" — its own empty state already redirects the user
// onward to Trips when nothing qualifies as active.
export default function RootPage() {
  redirect("/home");
}
