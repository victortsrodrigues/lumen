import { FieldErrors } from "react-hook-form";
import { useToast } from "./use-toast";

/**
 * Reusable handler for react-hook-form validation errors.
 * Shows a toast listing ALL missing/invalid fields at once.
 *
 * Usage:
 *   const onInvalid = useFormErrorHandler();
 *   <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>...
 */
export function useFormErrorHandler() {
  const { toast } = useToast();

  return (errors: FieldErrors) => {
    const messages: string[] = [];
    for (const err of Object.values(errors)) {
      const msg = (err as { message?: string })?.message;
      if (msg) messages.push(msg);
    }
    if (messages.length > 0) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: messages.join(" · "),
        variant: "destructive",
      });
    }
  };
}

/**
 * Cleans a form payload before sending to the API:
 * - Removes empty strings ("")
 * - Removes null / undefined
 * - Removes NaN (from <input type="number" valueAsNumber> when empty)
 *
 * Backends reject empty strings for date/number fields with 500 errors,
 * so this normalization should happen before every mutation.
 */
export function cleanFormPayload<T extends Record<string, unknown>>(values: T): Partial<T> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === "" || v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isNaN(v)) continue;
    cleaned[k] = v;
  }
  return cleaned as Partial<T>;
}
