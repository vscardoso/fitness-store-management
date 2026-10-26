import Toast from "react-native-toast-message";
import { AxiosError } from "axios";
import { OFFLINE_ERROR, GENERIC_ERROR, safeMessage, validationMessage } from "@/utils/friendlyError";

interface ApiErrorBody {
  detail?: string | { msg: string }[];
  message?: string;
}

export function parseApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorBody | undefined;
    if (data?.detail) {
      if (typeof data.detail === "string") return safeMessage(data.detail);
      if (Array.isArray(data.detail)) return validationMessage(data.detail);
    }
    if (data?.message) return safeMessage(data.message);
    if (error.response?.status === 401) return "Sessão expirada. Faça login novamente.";
    if (error.response?.status === 403) return "Você não tem permissão para esta ação.";
    if (error.response?.status === 404) return "Não encontramos o que você procurou.";
    if (error.response?.status === 422) return "Confira os campos e tente de novo.";
    if (error.response?.status === 500) return GENERIC_ERROR;
    if (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED") return OFFLINE_ERROR;
  }
  if (error instanceof Error) return safeMessage(error.message);
  return GENERIC_ERROR;
}

export function showApiError(error: unknown, title = "Erro") {
  // Sessão expirada já leva ao login com a mensagem; o toast por cima é ruído
  if ((error as { sessionExpired?: boolean } | null)?.sessionExpired) return;
  const message = parseApiError(error);
  Toast.show({
    type: "error",
    text1: title,
    text2: message,
    visibilityTime: 4000,
    position: "bottom",
  });
}

export function showApiSuccess(message: string, title = "Sucesso") {
  Toast.show({
    type: "success",
    text1: title,
    text2: message,
    visibilityTime: 2500,
    position: "bottom",
  });
}
