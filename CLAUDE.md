# Revenant

Built for the Tatum x Walrus "Total Recall" hackathon. Deadline: Mon 10 Nov 2026, 17:00 UTC.

## What Revenant does

A user pastes a new Sui token. The agent traces where the token creator's first funds came from (2 to 3 hops back, stopping at exchanges) using Tatum's Sui RPC. It then checks those wallets against Walrus Memory, which stores wallets linked to past confirmed rugs. It gives a plain-language warning with the trail shown. Each newly confirmed rug is saved to Walrus Memory, so the agent gets smarter over time.

## Stack

- Next.js (App Router) with TypeScript and Tailwind
- Walrus Memory SDK: `@mysten-incubation/memwal`, using the hosted Mainnet relayer `https://relayer.memory.walrus.xyz`
- Tatum's Sui Mainnet RPC
- No paid AI APIs

## Environment variables (in `.env.local`, never committed)

- `TATUM_API_KEY`
- `MEMWAL_ACCOUNT_ID`
- `MEMWAL_PRIVATE_KEY`
- `MEMWAL_SERVER_URL`

## Rules

1. **Small steps.** Do one small step at a time, then stop so the user can test it.
2. **Plain explanations.** The user is new to coding. Explain what you did and why in simple words, and avoid jargon (or explain it when it is needed).
3. **Never put secret keys in code or commits.** API keys and private keys live only in `.env.local`, which is in `.gitignore`. Read them with `process.env` on the server side only. Never hard-code them, never print them, and never use the `NEXT_PUBLIC_` prefix for them.
