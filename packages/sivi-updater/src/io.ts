/** Console and stdin, injectable so tests can capture output. */
export interface Io {
  /** Writes to stdout. */
  out(text: string): void;
  /** Writes to stderr. */
  err(text: string): void;
  /** Reads one line from stdin including its newline; whatever was read when stdin ends. */
  readLine(): Promise<string>;
}

export function processIo(): Io {
  let buffered = '';
  let ended = false;
  const stdin = process.stdin;
  return {
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
    async readLine() {
      stdin.setEncoding('utf8');
      for (;;) {
        const nl = buffered.indexOf('\n');
        if (nl >= 0) {
          const line = buffered.slice(0, nl + 1);
          buffered = buffered.slice(nl + 1);
          return line;
        }
        if (ended) {
          const rest = buffered;
          buffered = '';
          return rest;
        }
        const chunk = await new Promise<string | null>((resolve) => {
          const onData = (d: string): void => done(d);
          const onEnd = (): void => done(null);
          const done = (v: string | null): void => {
            stdin.off('data', onData);
            stdin.off('end', onEnd);
            stdin.pause();
            resolve(v);
          };
          stdin.on('data', onData);
          stdin.on('end', onEnd);
          stdin.resume();
        });
        if (chunk === null) ended = true;
        else buffered += chunk;
      }
    },
  };
}
