# MiniMax (Enclawed plugin)

Bundled MiniMax plugin for both:

- API-key provider setup (`minimax`)
- Token Plan OAuth setup (`minimax-portal`)

## Enable

```bash
enclawed plugins enable minimax
```

Restart the Gateway after enabling.

```bash
enclawed gateway restart
```

## Authenticate

OAuth:

```bash
enclawed models auth login --provider minimax-portal --set-default
```

API key:

```bash
enclawed setup --wizard --auth-choice minimax-global-api
```

## Notes

- MiniMax OAuth uses a user-code login flow.
- OAuth currently targets the Token Plan path.
