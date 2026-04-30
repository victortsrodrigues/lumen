import { forwardRef, useEffect, useState } from "react";

/**
 * Input mascarado para valores monetários em BRL.
 *
 * - Exibe formato "R$ 1.234,56" enquanto o usuário digita
 * - Internamente trabalha em centavos (sem ponto flutuante)
 * - Emite o valor em formato decimal para o consumidor (ex: "1234.56")
 *
 * Use sempre que houver campo de dinheiro (orçamento, doação, valor de
 * entrada/despesa, etc) — não use `<input type="number">` para isso.
 */
interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Valor decimal como string ("1234.56") ou number. Usado pra inicializar e exibir. */
  value: string | number | null | undefined;
  /** Recebe o valor decimal em string ("1234.56") — pronto pra enviar à API. */
  onChange: (decimalValue: string) => void;
  /** Texto opcional do prefixo (default "R$") */
  prefix?: string;
}

function digitsToFormatted(digits: string): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  const intWithThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/^0+(?=\d)/, "");
  return `${intWithThousands || "0"},${decPart}`;
}

function decimalToDigits(decimal: string | number | null | undefined): string {
  if (decimal === null || decimal === undefined || decimal === "") return "";
  const num = typeof decimal === "string" ? parseFloat(decimal) : decimal;
  if (Number.isNaN(num)) return "";
  return Math.round(num * 100).toString();
}

function digitsToDecimal(digits: string): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10)}.${decPart}`;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { value, onChange, prefix = "R$", className, ...rest },
  ref,
) {
  const [digits, setDigits] = useState(() => decimalToDigits(value));

  // Sync external value changes (e.g. when editing an existing record)
  useEffect(() => {
    const next = decimalToDigits(value);
    if (next !== digits) setDigits(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const formatted = digitsToFormatted(digits);

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={formatted}
        onChange={(e) => {
          const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 13);
          setDigits(onlyDigits);
          onChange(digitsToDecimal(onlyDigits));
        }}
        className={className ?? `w-full pl-9 pr-3 py-2 border rounded-lg bg-background text-sm`}
        placeholder="0,00"
        {...rest}
      />
    </div>
  );
});
