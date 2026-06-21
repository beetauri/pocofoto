import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"

function Spinner({
  className,
  ...props
}) {
  const { t } = useTranslation("common");
  return (
    <Loader2Icon
      role="status"
      aria-label={t("loading")}
      className={cn("size-4 animate-spin", className)}
      {...props} />
  );
}

export { Spinner }
