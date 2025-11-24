/**
 * Serviço de busca de CEP com provedores de fallback (ViaCEP, BrasilAPI, ApiCEP)
 */

import axios from 'axios';

export interface CepResponse {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro?: string;
  localidade: string; // cidade
  uf: string;         // estado (UF)
}

// Normaliza o CEP (apenas dígitos)
const normalizeCep = (cep: string): string => cep.replace(/\D/g, '');

// Provider 1: ViaCEP
const fetchViaCep = async (cep: string): Promise<CepResponse | null> => {
  const clean = normalizeCep(cep);
  const { data } = await axios.get<any>(`https://viacep.com.br/ws/${clean}/json/`);
  if (data?.erro) return null;
  return {
    cep: data.cep,
    logradouro: data.logradouro || '',
    complemento: data.complemento || '',
    bairro: data.bairro || '',
    localidade: data.localidade || '',
    uf: data.uf || '',
  };
};

// Provider 2: BrasilAPI
// Doc: https://brasilapi.com.br/docs#tag/CEP-V2/paths/~1cep~1v2~1%7Bcep%7D/get
const fetchBrasilApi = async (cep: string): Promise<CepResponse | null> => {
  const clean = normalizeCep(cep);
  const { data } = await axios.get<any>(`https://brasilapi.com.br/api/cep/v2/${clean}`);
  if (!data) return null;
  return {
    cep: data.cep || clean,
    logradouro: data.street || '',
    complemento: data.complement || '',
    bairro: data.neighborhood || '',
    localidade: data.city || '',
    uf: data.state || '',
  };
};

// Provider 3: ApiCEP
// Doc: https://apicep.com/api-de-consulta/
const fetchApiCep = async (cep: string): Promise<CepResponse | null> => {
  const clean = normalizeCep(cep);
  const { data } = await axios.get<any>(`https://ws.apicep.com/cep/${clean}.json`);
  if (!data || data.status !== 200) return null;
  return {
    cep: data.code || clean,
    logradouro: data.address || '',
    complemento: '',
    bairro: data.district || '',
    localidade: data.city || '',
    uf: data.state || '',
  };
};

/**
 * Buscar endereço por CEP, tentando provedores em cascata
 */
export const searchCep = async (cep: string): Promise<CepResponse | null> => {
  try {
    const cleanCep = normalizeCep(cep);

    // Validação básica
    if (cleanCep.length !== 8) {
      return null;
    }

    // Tentar ViaCEP
    try {
      const via = await fetchViaCep(cleanCep);
      if (via && via.localidade && via.uf) {
        if (__DEV__) console.log('📦 CEP via ViaCEP');
        return via;
      }
    } catch {}

    // Tentar BrasilAPI
    try {
      const br = await fetchBrasilApi(cleanCep);
      if (br && br.localidade && br.uf) {
        if (__DEV__) console.log('🇧🇷 CEP via BrasilAPI');
        return br;
      }
    } catch {}

    // Tentar ApiCEP
    try {
      const api = await fetchApiCep(cleanCep);
      if (api && api.localidade && api.uf) {
        if (__DEV__) console.log('🛰️ CEP via ApiCEP');
        return api;
      }
    } catch {}

    return null;
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    return null;
  }
};
