import { redirect } from "next/navigation";

// Rejestracja wyłączona - przekierowanie na stronę logowania
export default function SignupPage() {
  redirect("/login");
}
