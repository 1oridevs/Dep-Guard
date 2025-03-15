const fs = require('fs').promises;
const path = require('path');

class CompletionGenerator {
  async generateCompletion(shell) {
    const commands = [
      'analyze',
      'scan',
      'audit',
      'fix',
      'tree',
      'report',
      'policy',
      'monitor'
    ];

    const globalOptions = [
      '--help',
      '--version',
      '--debug',
      '--silent',
      '--config'
    ];

    switch (shell) {
      case 'bash':
        return this.generateBashCompletion(commands, globalOptions);
      case 'zsh':
        return this.generateZshCompletion(commands, globalOptions);
      case 'fish':
        return this.generateFishCompletion(commands, globalOptions);
      default:
        throw new Error(`Unsupported shell: ${shell}`);
    }
  }

  generateBashCompletion(commands, globalOptions) {
    return `
_dg_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  opts="${commands.join(' ')} ${globalOptions.join(' ')}"

  if [[ \${cur} == -* ]] ; then
    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
    return 0
  fi

  case "\${prev}" in
    analyze|scan|audit)
      local subopts="--json --output --format"
      COMPREPLY=( $(compgen -W "\${subopts}" -- \${cur}) )
      return 0
      ;;
    *)
      COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
      return 0
      ;;
  esac
}

complete -F _dg_completion dg dependency-guardian
`;
  }

  // Similar methods for zsh and fish completion...
}

module.exports = new CompletionGenerator(); 