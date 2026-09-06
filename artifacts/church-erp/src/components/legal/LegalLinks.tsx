import { Link } from "wouter";

export function LegalLinks() {
  return (
    <nav aria-label="Informações legais" className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <Link href="/privacidade" className="underline underline-offset-4 hover:text-foreground">Privacidade</Link>
      <Link href="/termos" className="underline underline-offset-4 hover:text-foreground">Termos de uso</Link>
    </nav>
  );
}
