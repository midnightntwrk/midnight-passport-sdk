// FS-0.2: the binding axis — the committed multi-version registry of the
// externally-owned ACC artefact (architecture §4.6, §8 decision 2; spec
// §4.1/D-8). Typed callers land in T2; loader integrity in T3.
export {
  type AccBinding,
  type AccRegistry,
  type CircuitHashes,
  type CircuitPin,
} from './manifest.generated.js';
export {
  ACC_REGISTRY,
  BINDING_VERSION,
  SUPPORTED_BINDINGS,
  UnsupportedBindingError,
  assertBindingCompatible,
  detectDeployedVersion,
  resolveBinding,
} from './registry.js';
export {
  AccModuleShapeError,
  bindAccModule,
  type AccContractInstance,
  type AccContractModule,
  type AccPureCircuits,
  type AccWitnessContext,
  type AccWitnesses,
} from './acc-module.js';
export { buildDeployArgs, type AccDeployArgs, type AccDeployInputs } from './deploy.js';
export {
  ACC_MODULE_FILE,
  UnknownCircuitError,
  ZkArtifactIntegrityError,
  loadArtefact,
  type AbortSignalLike,
  type ArtefactPart,
  type ArtefactSource,
  type LoadArtefactOptions,
  type LoadedAccArtefact,
} from './loader.js';
