// The `passportWasm` bundler plugin gives this module.
declare module 'mn-passport:wasm' {
  export const files: readonly { readonly id: string; readonly url: string }[];
}
