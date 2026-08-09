import { bench } from '@ark/attest';

undefined as undefined;

/** Deliberately expensive recursive conditional — gate self-test probe only. */
type makeComplexType<s extends string> = s extends `${infer head}${infer tail}`
  ? head | tail | makeComplexType<tail>
  : s;

bench('recursive-gate-probe', () => {
  return {} as makeComplexType<'antidisestablishmentarianism'>;
}).types([100, 'instantiations']);
