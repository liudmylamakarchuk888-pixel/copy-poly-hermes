# Bullpen CLI commands available on this machine

Generated: 2026-06-03T16:32:18.649231+00:00
Bullpen version: `bullpen 0.1.99 (Alpha)`

Safety note: this document was generated from help/read-only introspection only. No trading, approvals, wrapping, withdrawals, or wallet mutations were executed.

## Requested command resolution

| Requested command | Status on this machine | Correct equivalent if missing |
|---|---:|---|
| `bullpen --help` | exists |  |
| `bullpen polymarket --help` | exists |  |
| `bullpen polymarket data --help` | exists |  |
| `bullpen polymarket tracker --help` | missing / exit 2 | `bullpen tracker --help` |
| `bullpen polymarket approve --help` | exists |  |
| `bullpen polymarket pre-flight --help` | missing / exit 2 | `bullpen polymarket preflight --help` |

## `bullpen --help`

Exit code: `0`

```text
Bullpen CLI (Alpha) — trade prediction markets from your terminal

Usage: bullpen-native [OPTIONS] [COMMAND]

Commands:
  login          Log in to Bullpen via device auth (RFC 8628): displays a code, opens browser
  logout         Log out and clear stored credentials
  config         Initialize and manage CLI configuration
  portfolio      View portfolio balances, overview, and P&L across all chains
  polymarket     Polymarket prediction market commands: discover, search, trade, and manage positions [aliases: pm, prediction]
  points         Show Bullpen points balance and distribution history
  rewards        Show and claim available rewards
  quests         Show current Bullpen quests and quest history
  notifications  View and manage account notifications
  tracker        Track wallets and monitor smart money activity
  wallet         Manage wallets — list accounts, select primary wallet per chain
  funds          Multi-chain balance view across Polymarket, Hyperliquid, and Solana. (For deposits and cross-chain transfers, use https://app.bullpen.fi.)
  completion     Generate shell completion scripts for bash, zsh, fish, elvish, or PowerShell
  shell          Launch an interactive REPL shell with readline history
  setup          Guided first-time setup: configure, authenticate, and approve Polymarket trading
  status         Show CLI version, environment, account info, and Polymarket platform status
  version        Print the Bullpen CLI version
  experimental   Enable, disable, and list experimental features
  skill          Manage AI agent skill files (install, update, list, uninstall)
  hyperliquid    Hyperliquid perp trading, account reads, and order workflows (experimental)
  deposit        Deposit funds into your Bullpen account (opens web app)
  verify-email   Verify your email for full account access
  upgrade        Update the bullpen binary to the latest release from GitHub
  doctor         Diagnose auth and account health
  solana         Solana token balances and DeFi operations (experimental)
  help           Print this message or the help of the given subcommand(s)

Options:
      --output <OUTPUT>
          Output format for command results
          
          [possible values: table, json]

      --env <ENV>
          Target environment to connect to (overrides config.toml)
          
          [env: BULLPEN_ENV=]
          [possible values: staging, production]

      --config <CONFIG>
          Path to a custom config.toml file (overrides $BULLPEN_CONFIG and the default location).
          
          Explicit --config and BULLPEN_CONFIG paths fail closed: if the file is missing, the CLI exits validation instead of silently loading defaults. Credentials still resolve via BULLPEN_HOME, so set BULLPEN_HOME too when isolating a session.

      --read-only
          Enable read-only mode: blocks all mutating commands

      --non-interactive
          Suppress interactive prompts; does NOT imply --yes for money-moving commands
          
          [env: BULLPEN_NON_INTERACTIVE=]

  -h, --help
          Print help (see a summary with '-h')

  -V, --version
          Print version

ENVIRONMENT VARIABLES:
  BULLPEN_HOME                      Override the Bullpen data directory (default: ~/.bullpen)
  BULLPEN_CONFIG                    Override the path to config.toml (default: $BULLPEN_HOME/config.toml). Fails closed if the explicit path is missing
  BULLPEN_ENV                       Override the target environment (staging|production)
  BULLPEN_READ_ONLY                 Set to 1/true/yes/on to block all mutating commands globally
  BULLPEN_NON_INTERACTIVE           Set to 1/true/yes/on to suppress interactive prompts; does NOT imply --yes for money-moving commands
  BULLPEN_DISABLE_VERSION_GATE      Set to 1/true/yes/on to bypass the minimum-version kill-switch (emergency use only)
  BULLPEN_DISABLE_TELEMETRY         Set to 1/true/yes/on to opt out of anonymous usage telemetry
  BULLPEN_GITHUB_TOKEN              GitHub personal access token used by `upgrade` and update checks to avoid rate limits
  BULLPEN_UPDATE_URL                Override the GitHub releases API URL for `upgrade` and version checks
  BULLPEN_POLYGON_RPC_URL           Override the Polygon JSON-RPC endpoint (default: built-in public Polygon RPC)
  BULLPEN_ARBITRUM_RPC_URL          Override the Arbitrum JSON-RPC endpoint for Hyperliquid deposit helpers
  BULLPEN_SOLANA_RPC_URL            Override the Solana JSON-RPC endpoint
  BULLPEN_SOLANA_DEFAULT_SLIPPAGE_BPS  Override default Solana swap slippage in basis points
  BULLPEN_SOLANA_REFERRAL_ACCOUNT   Optional Jupiter referral token account for Solana swaps
  BULLPEN_SOLANA_REFERRAL_FEE_BPS   Optional Jupiter referral fee in basis points for Solana swaps
  BULLPEN_SUPPRESS_DEPRECATION_WARNINGS  Suppress migration/deprecation warnings in supported commands
  BULLPEN_DISABLE_ROUTING_WARNING_SUPPRESSION  Always show Polymarket wallet-routing warnings
  BULLPEN_HYPERLIQUID_FORCE_COMPAT_NO_BUILDER_ORDER_PLACEMENT  Disable Hyperliquid builder-order placement for compatibility
  RUST_LOG                          Enable file logging; e.g. RUST_LOG=debug writes to ~/.bullpen/log/bullpen-cli.log
```

## `bullpen polymarket --help`

Exit code: `0`

```text
Polymarket prediction market commands: discover, search, trade, and manage positions

Usage: bullpen-native polymarket [OPTIONS] <COMMAND>

Commands:
  discover                   Discover prediction markets with various lenses and filters
  positions                  View prediction market positions and P&L
  wallet-stats               Show server-derived wallet statistics, including risk and insider signals
  activity                   View activity history (trades, redemptions, rewards, etc.) [aliases: history]
  buy                        Buy shares on a prediction market outcome
  sell                       Sell shares on a prediction market outcome
  limit-buy                  Place a limit buy order on a prediction market outcome
  limit-sell                 Place a limit sell order on a prediction market outcome
  redeem                     Redeem resolved prediction market positions
  orders                     View open orders, trade history, or cancel orders
  poll-order                 Poll an order until it fills, cancels, or times out
  search                     Search prediction markets and trader profiles
  event                      View details for a specific prediction market event
  event-top-holders          Show top holders aggregated across all markets in an event
  events                     List and filter prediction market events
  trades                     Show recent trades on a market
  price-history              Show price history for a market outcome
  candles                    Show OHLC candlestick chart for a market outcome
  orderbook                  Show the live orderbook (bids and asks) for a market outcome
  preview                    Preview a trade: estimated fill price, fees, slippage, and total cost without executing
  holders                    Show top position holders for a market
  comments                   View comments on markets, events, series, or users
  feed                       View filtered trade or comment feeds (requires login)
  approve                    Check and set ERC-1155 token approvals for sell orders
  activate                   Activate the currently-selected Polymarket wallet for trading
  revoke                     Revoke all Polymarket trading approvals (ERC-1155 + pUSD)
  deploy-deposit-wallet      Deploy and activate your Polymarket deposit wallet
  reregister-deposit-wallet  Re-register an already-deployed deposit wallet with the Bullpen server
  wallet                     Check Polymarket wallet routing and balances for every owner EOA
  wallet-audit               Detect split-brain / assets-in-both state across all owner EOAs
  consolidate                Consolidate stranded assets to your server-selected Polymarket wallet
  migrate                    Move pUSD between your legacy Safe and Deposit Wallet
  migrate-collateral         Migrate stranded pUSD from your Safe wallet to your deposit wallet
  preflight                  Run pre-trade safety checks (server time, account status, balance, approvals)
  doctor                     Run diagnostic checks for trading readiness
  market                     Show detailed market information
  markets                    List and filter markets
  price                      Quick price check for a prediction market (midpoint, last trade, bid/ask, spread)
  withdraw                   Withdraw USDC.e from a Deposit Wallet on Polygon; other withdrawals use the web app
  wrap                       Wrap USDC into pUSD (Polymarket collateral token)
  unwrap                     Unwrap pUSD back to USDC
  sweep-stranded             Move a stranded ERC-20 token out of your Safe wallet via a gasless relayer transaction
  sweep-native-pol           Move native POL accidentally sent to a Deposit Wallet via the gasless relayer
  sweep-signer-eoa           Sweep USDC held directly on a signer EOA into your active Polymarket wallet
  bridge                     Bridge utilities: check deposit transaction status
  tags                       List market tags/categories
  categories                 Browse market categories with stats from top markets (market count, volume, examples)
  series                     List event series or show series detail
  teams                      List sports teams
  sports-list                List all supported sports categories
  sports-market-types        List valid sports market types
  split                      Split USDC into YES and NO tokens for a market
  merge                      Merge YES and NO tokens back into USDC
  redeem-neg-risk            Redeem neg-risk positions using the NegRiskAdapter
  condition-id               Calculate a condition ID from oracle address, question ID, and outcome count
  collection-id              Calculate a collection ID from condition ID and index set
  position-id                Calculate a position ID from collateral token and collection ID
  rewards                    View your Polymarket reward earnings and active reward programs
  watch                      Subscribe to real-time market data via WebSocket
  clob                       Direct CLOB API commands: prices, order book, balances, and order lookup
  data                       Query Polymarket data: leaderboards, profiles, smart money, open interest, and builder stats
  bracket                    Bracket contest commands: March Madness picks, leaderboard, and results
  help                       Print this message or the help of the given subcommand(s)

Options:
      --output <OUTPUT>
          Output format for command results
          
          [possible values: table, json]

      --env <ENV>
          Target environment to connect to (overrides config.toml)
          
          [env: BULLPEN_ENV=]
          [possible values: staging, production]

      --config <CONFIG>
          Path to a custom config.toml file (overrides $BULLPEN_CONFIG and the default location).
          
          Explicit --config and BULLPEN_CONFIG paths fail closed: if the file is missing, the CLI exits validation instead of silently loading defaults. Credentials still resolve via BULLPEN_HOME, so set BULLPEN_HOME too when isolating a session.

      --read-only
          Enable read-only mode: blocks all mutating commands

      --non-interactive
          Suppress interactive prompts; does NOT imply --yes for money-moving commands
          
          [env: BULLPEN_NON_INTERACTIVE=]

  -h, --help
          Print help (see a summary with '-h')
```

## `bullpen polymarket data --help`

Exit code: `0`

```text
Query Polymarket data: leaderboards, profiles, smart money, open interest, and builder stats

Usage: bullpen-native polymarket data [OPTIONS] <COMMAND>

Commands:
  my-trades            View your authenticated indexed trade history with trade-type labels
  leaderboard          View top traders on the leaderboard
  profile              View trader profile statistics
  smart-money          View smart money signals and top trader activity
  open-interest        Get open interest (outstanding position value) for a market
  volume               Get live trading volume for an event
  builder-leaderboard  Builder (third-party app) leaderboard rankings
  builder-volume       Builder volume time-series data
  traded               Get count of unique markets traded by a wallet
  help                 Print this message or the help of the given subcommand(s)

Options:
      --output <OUTPUT>
          Output format for command results
          
          [possible values: table, json]

      --env <ENV>
          Target environment to connect to (overrides config.toml)
          
          [env: BULLPEN_ENV=]
          [possible values: staging, production]

      --config <CONFIG>
          Path to a custom config.toml file (overrides $BULLPEN_CONFIG and the default location).
          
          Explicit --config and BULLPEN_CONFIG paths fail closed: if the file is missing, the CLI exits validation instead of silently loading defaults. Credentials still resolve via BULLPEN_HOME, so set BULLPEN_HOME too when isolating a session.

      --read-only
          Enable read-only mode: blocks all mutating commands

      --non-interactive
          Suppress interactive prompts; does NOT imply --yes for money-moving commands
          
          [env: BULLPEN_NON_INTERACTIVE=]

  -h, --help
          Print help (see a summary with '-h')
```

## `bullpen polymarket tracker --help`

Exit code: `2`

```text
error: unrecognized subcommand 'tracker'

  tip: some similar subcommands exist: 'trade-alert', 'trades', 'bracket'

Usage: bullpen-native polymarket [OPTIONS] <COMMAND>

For more information, try '--help'.
```

## `bullpen tracker --help  # equivalent for: bullpen polymarket tracker --help`

Exit code: `0`

```text
Track wallets and monitor smart money activity

Usage: bullpen-native tracker [OPTIONS] <COMMAND>

Commands:
  add        Track a Polymarket address
  remove     Stop tracking an address
  list       List tracked addresses
  update     Update tracking settings for an address
  feed       Show trade feed from tracked addresses
  groups     Manage wallet groups
  watchlist  Manage watchlist
  alerts     Manage alerts
  copy       Manage copy trading subscriptions
  help       Print this message or the help of the given subcommand(s)

Options:
      --output <OUTPUT>
          Output format for command results
          
          [possible values: table, json]

      --env <ENV>
          Target environment to connect to (overrides config.toml)
          
          [env: BULLPEN_ENV=]
          [possible values: staging, production]

      --config <CONFIG>
          Path to a custom config.toml file (overrides $BULLPEN_CONFIG and the default location).
          
          Explicit --config and BULLPEN_CONFIG paths fail closed: if the file is missing, the CLI exits validation instead of silently loading defaults. Credentials still resolve via BULLPEN_HOME, so set BULLPEN_HOME too when isolating a session.

      --read-only
          Enable read-only mode: blocks all mutating commands

      --non-interactive
          Suppress interactive prompts; does NOT imply --yes for money-moving commands
          
          [env: BULLPEN_NON_INTERACTIVE=]

  -h, --help
          Print help (see a summary with '-h')
```

## `bullpen polymarket approve --help`

Exit code: `0`

```text
Check and set ERC-1155 token approvals for sell orders

Usage: bullpen-native polymarket approve [OPTIONS]

Options:
      --check
          Only check approval status, don't submit transactions

      --output <OUTPUT>
          Output format for command results
          
          [possible values: table, json]

      --env <ENV>
          Target environment to connect to (overrides config.toml)
          
          [env: BULLPEN_ENV=]
          [possible values: staging, production]

      --no-cache
          Force a live approval-status RPC read and bypass the short diagnostic cache

      --config <CONFIG>
          Path to a custom config.toml file (overrides $BULLPEN_CONFIG and the default location).
          
          Explicit --config and BULLPEN_CONFIG paths fail closed: if the file is missing, the CLI exits validation instead of silently loading defaults. Credentials still resolve via BULLPEN_HOME, so set BULLPEN_HOME too when isolating a session.

      --yes
          Skip confirmation prompt

      --wallet <WALLET>
          Pin the signer to a specific owner EOA (0x…). Bypasses the active-wallet cache and resolves the Polymarket wallet context directly for this address. Use in bot automation to avoid wallet-select races

      --read-only
          Enable read-only mode: blocks all mutating commands

      --non-interactive
          Suppress interactive prompts; does NOT imply --yes for money-moving commands
          
          [env: BULLPEN_NON_INTERACTIVE=]

  -h, --help
          Print help (see a summary with '-h')

EXAMPLES:
  bullpen polymarket approve --help
      Show options for this command without signing, submitting, or changing state.
```

## `bullpen polymarket pre-flight --help`

Exit code: `2`

```text
error: unrecognized subcommand 'pre-flight'

  tip: some similar subcommands exist: 'sports-list', 'preflight'

Usage: bullpen-native polymarket [OPTIONS] <COMMAND>

For more information, try '--help'.
```

## `bullpen polymarket preflight --help  # equivalent for: bullpen polymarket pre-flight --help`

Exit code: `0`

```text
Run pre-trade safety checks (server time, account status, balance, approvals)

Usage: bullpen-native polymarket preflight [OPTIONS]

Options:
      --brief
          Suppress multi-EOA enumeration section; show only active wallet diagnostic

      --output <OUTPUT>
          Output format for command results
          
          [possible values: table, json]

      --env <ENV>
          Target environment to connect to (overrides config.toml)
          
          [env: BULLPEN_ENV=]
          [possible values: staging, production]

      --no-cache
          Force a live approval-status RPC read and bypass the short diagnostic cache

      --config <CONFIG>
          Path to a custom config.toml file (overrides $BULLPEN_CONFIG and the default location).
          
          Explicit --config and BULLPEN_CONFIG paths fail closed: if the file is missing, the CLI exits validation instead of silently loading defaults. Credentials still resolve via BULLPEN_HOME, so set BULLPEN_HOME too when isolating a session.

      --read-only
          Enable read-only mode: blocks all mutating commands

      --non-interactive
          Suppress interactive prompts; does NOT imply --yes for money-moving commands
          
          [env: BULLPEN_NON_INTERACTIVE=]

  -h, --help
          Print help (see a summary with '-h')

EXAMPLES:
  bullpen polymarket preflight --help
      Show options for this command without signing, submitting, or changing state.
```
