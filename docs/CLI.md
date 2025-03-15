# Command Line Interface

Dependency Guardian provides two command names for convenience:

- `dependency-guardian` - Full name
- `dg` - Short alias

Both commands work exactly the same way. Use whichever you prefer:

```bash
# These commands are equivalent:
dependency-guardian analyze
dg analyze

# Examples using the short alias:
dg scan
dg audit
dg fix
dg tree --depth 3
```

## Global Installation

When installed globally, both commands will be available system-wide:

```bash
npm install -g dependency-guardian

# Now you can use either command:
dependency-guardian --version
dg --version
```

## Local Installation

When installed locally in a project:

```bash
npm install --save-dev dependency-guardian

# Use through npx:
npx dependency-guardian analyze
npx dg analyze

# Or add to package.json scripts:
{
  "scripts": {
    "deps": "dg analyze",
    "deps:audit": "dg audit",
    "deps:fix": "dg fix"
  }
}
```

## Shell Completion

To enable shell completion for the `dg` command:

```bash
# Bash
dg completion bash > ~/.dg-completion.bash
echo 'source ~/.dg-completion.bash' >> ~/.bashrc

# Zsh
dg completion zsh > ~/.zsh/completion/_dg
echo 'fpath=(~/.zsh/completion $fpath)' >> ~/.zshrc

# Fish
dg completion fish > ~/.config/fish/completions/dg.fish
``` 