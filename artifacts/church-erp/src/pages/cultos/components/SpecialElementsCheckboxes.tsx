import { Wine, Droplets, UserPlus } from "lucide-react";

interface Props {
  hasCommunion: boolean;
  hasBaptism: boolean;
  hasMemberReception: boolean;
  onChange: (field: "hasCommunion" | "hasBaptism" | "hasMemberReception", value: boolean) => void;
  disabled?: boolean;
}

export function SpecialElementsCheckboxes({
  hasCommunion, hasBaptism, hasMemberReception, onChange, disabled = false,
}: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground mb-2">Elementos Especiais</p>
      <CheckRow
        icon={<Wine className="h-4 w-4 text-purple-600" />}
        label="Santa Ceia"
        description="Celebração da Ceia do Senhor"
        checked={hasCommunion}
        onChange={(v) => onChange("hasCommunion", v)}
        disabled={disabled}
      />
      <CheckRow
        icon={<Droplets className="h-4 w-4 text-blue-600" />}
        label="Batismo"
        description="Cerimônia de batismo"
        checked={hasBaptism}
        onChange={(v) => onChange("hasBaptism", v)}
        disabled={disabled}
      />
      <CheckRow
        icon={<UserPlus className="h-4 w-4 text-emerald-600" />}
        label="Recepção de Membros"
        description="Profissão de fé / transferência"
        checked={hasMemberReception}
        onChange={(v) => onChange("hasMemberReception", v)}
        disabled={disabled}
      />
    </div>
  );
}

function CheckRow({
  icon, label, description, checked, onChange, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-lg border ${
      checked ? "bg-primary/5 border-primary/30" : "bg-background border-border"
    } ${disabled ? "opacity-70" : "cursor-pointer hover:bg-muted/50"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{label}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </label>
  );
}
