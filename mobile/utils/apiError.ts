import Toast from "react-native-toast-message";
import { AxiosError } from "axios";

interface ApiErrorBody {
  detail?: string | { msg: string }[];
  message?: string;
}

export function parseApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorBody | undefined;
    if (data?.detail) {
      if (typeof data.detail === "string") return data.detail;
      if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(", ");
    }
    if (data?.message) return data.message;
    if (error.response?.status === 401) return "Sessão expirada. Faça login novamente.";
    if (error.response?.status === 403) return "Você não tem permissão para esta ação.";
    if (error.response?.status === 404) return "Recurso não encontrado.";
    if (error.response?.status === 422) return "Dados inválidos. Verifique os campos.";
    if (error.response?.status === 500) return "Erro interno no servidor. Tente novamente.";
    if (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED") return "Sem conexão com o servidor.";
  }
  if (error instanceof Error) return error.message;
  return "Ocorreu um erro inesperado.";
}

export function showApiError(error: unknown, title = "Erro") {
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
