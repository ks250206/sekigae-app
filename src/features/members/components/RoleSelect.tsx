import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_GROUPS, ROLE_ORDER, ROLES, type RoleGroup, type RoleKey } from "@/domain/roles";
import { RoleBadge } from "./badges";

/** シニア順・グループごとの役職一覧 */
export const ROLE_GROUPED: { group: RoleGroup; roles: RoleKey[] }[] = ROLE_GROUPS.map((group) => ({
  group,
  roles: ROLE_ORDER.filter((r) => ROLES[r].group === group),
})).filter((g) => g.roles.length > 0);

export function RoleSelect({
  value,
  onChange,
  id,
  className,
  size,
}: {
  value: RoleKey;
  onChange: (r: RoleKey) => void;
  id?: string;
  className?: string;
  size?: "sm" | "default";
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RoleKey)}>
      <SelectTrigger id={id} className={className ?? "w-full"} size={size} data-testid="role-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {ROLE_GROUPED.map(({ group, roles }) => (
          <SelectGroup key={group}>
            <SelectLabel>{t(`roleGroups.${group}`)}</SelectLabel>
            {roles.map((r) => (
              <SelectItem key={r} value={r} data-testid={`role-option-${r}`}>
                <RoleBadge role={r} className="min-w-9 justify-center" />
                <span>{t(`rolesLong.${r}`)}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** ネイティブ select 用の option 群（インライン編集） */
export function NativeRoleOptions() {
  const { t } = useTranslation();
  return (
    <>
      {ROLE_GROUPED.map(({ group, roles }) => (
        <optgroup key={group} label={t(`roleGroups.${group}`)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {t(`rolesLong.${r}`)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
