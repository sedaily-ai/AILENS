// "--key value" 또는 "--flag"(값 없으면 'true') 형태의 인자를 파싱한다.
export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      const value = next && !next.startsWith('--') ? argv[++i] : 'true';
      args[key] = value;
    }
  }
  return args;
}
