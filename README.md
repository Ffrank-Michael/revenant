# Revenant

Revenant checks a new Sui token and traces where its creator's first money came from. It compares the wallets and SUI coins in that trail with rug pulls it has seen before, and shows a plain-language warning with the trail.

Live site: https://revenantwatch.vercel.app

Read the story: [How I flagged a rug pull on Sui 3 hours before it happened, and built a memory to catch the next](https://medium.com/@godspowerfrank0333/how-i-flagged-a-rug-pull-on-sui-3-hours-before-it-happened-and-built-a-memory-to-catch-the-next-9d62566bc416)

Built for the Tatum x Walrus "Total Recall" hackathon.

## How it works

1. You paste a token address on Sui.
2. Revenant finds the wallet that launched the token and follows that wallet's money back up to three real wallets, stopping early at an exchange or a very busy wallet.
3. It checks the wallets and the exact SUI coins in that trail against the rug pulls it remembers.
4. It shows a short verdict and the trail behind it.

A link means money moved between wallets. It does not show who is behind them, and "no links" does not mean a token is safe.

## Tatum

Revenant reads the Sui chain through the Tatum Sui gateway (Sui Mainnet). Every trace, pull check and coin history comes from there. The free plan allows 3 requests per second, so the app queues its calls.

## Walrus Memory

Each confirmed rug pull is saved as a memory on Walrus Mainnet, using the Walrus Memory SDK (`@mysten-incubation/memwal`) and the hosted relayer. Warnings are saved in a separate place. The app also builds an index from these memories, so it can look up an exact wallet address or SUI coin ID quickly. A saved copy of the index sits in `data/` as a fallback if Walrus is slow.

Rug pulls count as confirmed only after a person checks them on Suiscan. The watcher can save a pull on its own, marked as awaiting review.

## Environment variables

Put these in a file named `.env.local` in the project folder. Never commit this file.

- `TATUM_API_KEY`
- `MEMWAL_ACCOUNT_ID`
- `MEMWAL_PRIVATE_KEY`
- `MEMWAL_SERVER_URL`

The keys are only read on the server.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To check that the production build works, run `npm run build`.

## What it does not do yet

- It does not scan for new tokens by itself. Someone has to paste a token address.
- A watcher script exists (`scripts/watch-coin.ts`) that re-checks one token every few minutes and acts when its pool is emptied, but you start it by hand and it does not run on a schedule.

The plan for automatic watching is in [ROADMAP.md](ROADMAP.md).
