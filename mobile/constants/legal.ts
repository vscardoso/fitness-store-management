/**
 * Termos de Uso e Política de Privacidade do Provador.
 *
 * RASCUNHO: revisar com advogado antes do lançamento público. Os campos entre colchetes
 * ([RAZÃO SOCIAL] etc.) ficam em LEGAL_COMPANY e precisam ser preenchidos.
 * Mudou qualquer texto? Troque LEGAL_VERSION aqui e em backend/app/core/legal.py
 * (o teste backend/tests/test_legal.py confere): todo usuário aceita de novo no próximo login.
 */
export const LEGAL_VERSION = '2026-10-26';

export const LEGAL_COMPANY = {
  name: '[RAZÃO SOCIAL]',
  document: '[CNPJ]',
  address: '[ENDEREÇO COMPLETO]',
  forum: '[CIDADE/UF]',
  dpo: '[NOME DO ENCARREGADO DE DADOS]',
  email: 'suporte@provadorfit.com.br',
};

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

const C = LEGAL_COMPANY;

export const TERMS: LegalSection[] = [
  {
    title: '1. Quem somos e o que é o Provador',
    paragraphs: [
      `O Provador é um sistema de gestão e de relacionamento com clientes (CRM) para lojas de moda fitness, oferecido como serviço pela internet (SaaS) por ${C.name}, inscrita no CNPJ ${C.document}, com endereço em ${C.address} ("Provador", "nós").`,
      'Quem usa o Provador é a loja e a sua equipe. Os clientes da loja não acessam o Provador, não têm conta nele e não recebem nada do Provador.',
      'Com ele a loja cadastra produtos com tamanho e cor, controla estoque, registra vendas, clientes, envios condicionais, trocas, fornecedores, despesas e acompanha o resultado do negócio, pelo celular ou pelo computador.',
      'Ao criar uma conta ou continuar usando o Provador, você declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade.',
    ],
  },
  {
    title: '2. Conta e acesso',
    paragraphs: [
      'Para usar o Provador é preciso ter 18 anos ou mais e informar dados verdadeiros. Quem cria a conta da loja é o administrador e responde pela loja dentro do sistema.',
      'O administrador pode convidar pessoas da equipe e definir o que cada uma pode fazer (caixa, vendedor, gerente ou administrador). Cada pessoa usa o próprio login.',
      'A senha é pessoal. Avise-nos em caso de suspeita de uso indevido da sua conta.',
    ],
  },
  {
    title: '3. Período de teste e planos',
    paragraphs: [
      'Toda loja começa em período de teste. Os planos pagos, seus valores e a forma de pagamento são informados antes de qualquer cobrança, e nenhuma cobrança é feita sem a sua contratação.',
      'Cada plano tem limites próprios, como o número de pessoas da equipe.',
    ],
  },
  {
    title: '4. Uso permitido',
    paragraphs: [
      'Você se compromete a usar o Provador apenas para a gestão da sua loja, de acordo com a lei. Não é permitido tentar acessar dados de outras lojas, burlar limites de segurança, revender o sistema ou usá-lo para enviar mensagens sem autorização de quem as recebe.',
    ],
  },
  {
    title: '5. Dados que a loja cadastra',
    paragraphs: [
      'Os dados dos clientes, fornecedores e da equipe que a loja cadastra pertencem à loja. A loja é a controladora desses dados e é responsável por ter uma base legal para tratá-los e por informar seus clientes, como pede a Lei Geral de Proteção de Dados (LGPD).',
      'O Provador trata esses dados apenas para prestar o serviço à loja, seguindo as instruções da loja, como operador. Cada loja só enxerga os próprios dados.',
      'O Provador não entra em contato com os clientes da loja: não envia mensagens, ofertas nem cobranças a eles. Se a loja usar uma integração opcional com um canal próprio dela (por exemplo, o WhatsApp da loja), as mensagens são enviadas pela loja, em nome dela, e são de responsabilidade dela, que deve respeitar a vontade do cliente de receber ou não mensagens.',
    ],
  },
  {
    title: '6. Disponibilidade e cópias de segurança',
    paragraphs: [
      'Trabalhamos para manter o Provador disponível e seguro, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros. Fazemos cópias de segurança diárias e cifradas do banco de dados.',
      'O Provador ajuda na gestão, mas não substitui o contador da loja e não emite nota fiscal.',
    ],
  },
  {
    title: '7. Responsabilidade',
    paragraphs: [
      'Respondemos pelos danos que causarmos na prestação do serviço, nos limites da lei. Não respondemos por decisões de negócio tomadas com base nos relatórios, por dados cadastrados de forma errada pela loja nem por falhas de serviços de terceiros que a loja escolher usar (por exemplo, maquininhas e meios de pagamento).',
    ],
  },
  {
    title: '8. Encerramento da conta',
    paragraphs: [
      `A loja pode encerrar a conta quando quiser, pedindo pelo e-mail ${C.email}. Antes do encerramento, a loja pode pedir uma cópia dos seus dados.`,
      'Podemos suspender uma conta que descumpra estes termos, avisando antes sempre que possível.',
    ],
  },
  {
    title: '9. Mudanças nestes termos',
    paragraphs: [
      'Se estes termos mudarem, avisaremos no próprio aplicativo e pediremos um novo aceite antes de continuar o uso. A versão em vigor fica sempre publicada nesta página.',
    ],
  },
  {
    title: '10. Lei e foro',
    paragraphs: [
      `Estes termos seguem a lei brasileira. Fica eleito o foro da comarca de ${C.forum}, ressalvado o direito do consumidor de escolher o foro do seu domicílio.`,
      `Dúvidas: ${C.email}.`,
    ],
  },
];

export const PRIVACY: LegalSection[] = [
  {
    title: '1. Sobre esta política',
    paragraphs: [
      `Esta política explica como ${C.name} (CNPJ ${C.document}), responsável pelo Provador, trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).`,
      'Ela vale para quem usa o Provador: a loja e a sua equipe. Os clientes da loja não usam o Provador; esta política explica também como guardamos os dados que a loja cadastra sobre eles no CRM.',
    ],
  },
  {
    title: '2. Quais dados tratamos',
    paragraphs: [
      'Da sua conta: nome, e-mail, telefone, senha (guardada de forma cifrada, nunca em texto), função na loja e registros de acesso, como data, endereço IP e navegador, incluindo o registro do aceite destes termos.',
      'Da loja: nome, endereço, logo, cores e configurações.',
      'Cadastrados pela loja: clientes (nome, e-mail, telefone, CPF, data de nascimento, endereço, histórico de compras, pontos de fidelidade e se aceitou receber ofertas), fornecedores (nome, CPF ou CNPJ e contato), produtos, fotos, vendas, estoque e despesas.',
      'Se a loja conectar o WhatsApp da própria loja (integração opcional): as mensagens trocadas nesse número, guardadas para a loja consultar no CRM.',
    ],
  },
  {
    title: '3. Para que usamos',
    paragraphs: [
      'Para prestar o serviço contratado (executar o contrato), manter a sua conta segura e prevenir fraudes (legítimo interesse), cumprir obrigações legais e falar com você sobre a sua conta.',
      'Não vendemos dados pessoais, não entramos em contato com os clientes da loja e não usamos os dados deles para nenhum fim próprio.',
    ],
  },
  {
    title: '4. Papéis de cada um',
    paragraphs: [
      'Sobre os dados da sua conta, o Provador é o controlador.',
      'Sobre os dados que a loja cadastra a respeito dos seus clientes, a loja é a controladora e o Provador é o operador: tratamos esses dados apenas para prestar o serviço à loja. Pedidos dos clientes da loja sobre esses dados devem ser feitos à própria loja, e nós a ajudamos a atendê-los.',
    ],
  },
  {
    title: '5. Com quem compartilhamos',
    paragraphs: [
      'Usamos fornecedores que nos ajudam a operar o serviço, com contratos e medidas de segurança: hospedagem do servidor (Hetzner Online GmbH), cópia de segurança cifrada (Google Drive), e-mail (Zoho), notificações no celular (Expo), leitura de fotos de produto por inteligência artificial, quando a loja usa o scanner (Google Gemini), WhatsApp oficial, quando a loja conecta o seu número (Meta) e meios de pagamento, quando a loja os ativa (por exemplo, Mercado Pago).',
      'Alguns desses fornecedores ficam fora do Brasil. Nesses casos a transferência segue as regras da LGPD.',
      'Também podemos compartilhar dados quando a lei ou uma autoridade exigir.',
    ],
  },
  {
    title: '6. Por quanto tempo guardamos',
    paragraphs: [
      'Enquanto a conta estiver ativa. Depois do encerramento, os dados são apagados em até 90 dias, salvo o que a lei obrigar a manter. As cópias de segurança cifradas são guardadas por 30 dias e os registros de erro do sistema também.',
    ],
  },
  {
    title: '7. Segurança',
    paragraphs: [
      'Conexão sempre cifrada (HTTPS), senhas guardadas de forma cifrada, acesso por função dentro de cada loja, separação entre lojas, servidor com acesso restrito e cópias de segurança cifradas fora do servidor.',
    ],
  },
  {
    title: '8. Seus direitos',
    paragraphs: [
      'Você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão do que for desnecessário, portabilidade, informação sobre com quem compartilhamos e revogação de consentimento. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
      `Para exercer seus direitos, escreva para ${C.email}. Respondemos em até 15 dias.`,
    ],
  },
  {
    title: '9. Armazenamento no aparelho',
    paragraphs: [
      'O aplicativo guarda no seu aparelho apenas o necessário para funcionar, como a sessão de login e preferências da tela. Não usamos ferramentas de publicidade nem rastreamento de terceiros.',
    ],
  },
  {
    title: '10. Encarregado e contato',
    paragraphs: [
      `Encarregado de dados: ${C.dpo}. Contato: ${C.email}. Endereço: ${C.address}.`,
      'Se esta política mudar, avisaremos no aplicativo e pediremos um novo aceite.',
    ],
  },
];
