# Publicar

Três jeitos, do mais simples ao mais trabalhoso.

## A. Site próprio na Vercel (recomendado)

O formulário vive num endereço só dele, por exemplo `diagnostico.seudominio.com`. É o melhor para anúncios: carrega rápido e não depende do resto do site.

1. **GitHub.** Crie um repositório **privado** e envie o projeto para lá (`git remote add origin ...`, `git push -u origin main`). Confira antes que o `.env.local` não vai junto (`git check-ignore .env.local`).
2. **Vercel.** Em vercel.com > Add New > Project, importe o repositório. Não mude nada no build.
3. **Variáveis.** Em Settings > Environment Variables, cadastre as mesmas do `.env.local` (ou rode `npx vercel link` e depois `npm run chave -- NOME` para cada uma, que grava lá também).
4. **Publicar de novo** (Deployments > ⋯ > Redeploy), para as variáveis valerem.
5. **Domínio.** Settings > Domains > `diagnostico.seudominio.com`. A Vercel mostra o registro CNAME para criar no seu DNS.
6. **Teste de ponta a ponta** no endereço publicado com `?teste=1` no fim (ex. `https://diagnostico.seudominio.com/?teste=1`), do primeiro "Oi" ao e-mail na sua caixa com [TESTE] no assunto. Depois, `npm run leads -- apagar-testes`.

> O plano Hobby da Vercel é para uso não comercial. Para o formulário de uma empresa, os termos pedem o plano Pro. Avalie com o seu cliente.

## B. Dentro de um site Next.js que já existe

Copie `formulario.ts`, `src/lib/*`, `src/app/conversa.tsx`, `src/app/pecas.tsx` e as rotas `src/app/api/ia` e `src/app/api/respostas`. Crie a página (ex. `src/app/diagnostico/page.tsx`) que mostra `<Conversa />`.

O `globals.css` deste projeto mexe em `body` e define as cores em `:root`. Num site que já tem visual próprio, ponha as regras dentro de uma classe (ex. `.fd-raiz`) e embrulhe a página nela. Peça à sua LLM: "copia o form-dinamico para este site, na rota /diagnostico, sem mexer no visual do resto".

## C. Alojamento PHP (cPanel, WordPress, servidor próprio sem Node)

`npm run exportar` gera a pasta `publicar/` com a mesma página e uma API em PHP. Guia completo em [PHP.md](PHP.md). Com WordPress no mesmo domínio, use `--caminho /pedido` e envie para essa subpasta.

## D. Dentro de Wix ou outro construtor sem PHP

Publique como em **A** (ou **C**) e coloque o formulário numa página do site com um bloco de HTML:

```html
<iframe src="https://diagnostico.seudominio.com" title="Diagnóstico"
  style="width:100%;height:100vh;border:0;display:block"></iframe>
```

Para anúncios, prefira mandar o tráfego direto para o endereço de **A**. O iframe carrega mais devagar e o Pixel mede pior.

## Medir os anúncios

- **Pixel da Meta ou Google Tag.** Coloque o código no `src/app/layout.tsx`. No fim da conversa, a página dispara `fbq('track', 'Lead')` se o Pixel estiver lá.
- **De onde veio cada lead.** Use `utm_source`, `utm_campaign` e `utm_content` no link do anúncio. Ficam gravados na coluna `origem` e aparecem no e-mail.
