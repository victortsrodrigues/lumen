import { FieldErrors } from "react-hook-form";
import { AlertCircle } from "lucide-react";

interface FormErrorSummaryProps {
  errors: FieldErrors;
}

/**
 * Renders a banner at the top of a form listing all validation errors.
 * Drop into any react-hook-form form:
 *
 *   <FormErrorSummary errors={form.formState.errors} />
 */
export function FormErrorSummary({ errors }: FormErrorSummaryProps) {
  const messages: string[] = [];
  for (const err of Object.values(errors)) {
    const msg = (err as { message?: string })?.message;
    if (msg) messages.push(msg);
  }

  if (messages.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold mb-1">Preencha os campos obrigatórios:</p>
        <ul className="list-disc list-inside space-y-0.5">
          {messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
