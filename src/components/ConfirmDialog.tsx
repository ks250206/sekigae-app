import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useConfirmStore } from "./confirm";

/** AppShell に 1 つ置く */
export function ConfirmHost() {
  const { t } = useTranslation();
  const { open, options, resolve } = useConfirmStore();
  const close = (v: boolean) => {
    resolve?.(v);
    useConfirmStore.setState({ open: false, resolve: null });
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {options?.cancelLabel ?? t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              options?.destructive ? buttonVariants({ variant: "destructive" }) : undefined
            }
            onClick={() => close(true)}
          >
            {options?.confirmLabel ?? t("actions.ok")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
