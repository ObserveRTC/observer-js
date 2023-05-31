// @generated by protoc-gen-es v1.1.1 with parameter "target=ts"
// @generated from file models.proto (package org.observertc.observer.models, syntax proto2)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto2 } from "@bufbuild/protobuf";
import { Samples_ClientSample_Browser, Samples_ClientSample_Engine, Samples_ClientSample_IceCandidatePair, Samples_ClientSample_IceLocalCandidate, Samples_ClientSample_IceRemoteCandidate, Samples_ClientSample_InboundAudioTrack, Samples_ClientSample_InboundVideoTrack, Samples_ClientSample_OperationSystem, Samples_ClientSample_OutboundAudioTrack, Samples_ClientSample_OutboundVideoTrack, Samples_ClientSample_PeerConnectionTransport, Samples_ClientSample_Platform } from "./samples_pb.js";

/**
 * @generated from message org.observertc.observer.models.Call
 */
export class Call extends Message<Call> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string roomId = 2;
   */
  roomId?: string;

  /**
   * @generated from field: required string callId = 3;
   */
  callId?: string;

  /**
   * @generated from field: required uint64 started = 4;
   */
  started?: bigint;

  /**
   * @generated from field: repeated string clientIds = 5;
   */
  clientIds: string[] = [];

  constructor(data?: PartialMessage<Call>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.Call";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "roomId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "callId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "started", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 5, name: "clientIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Call {
    return new Call().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Call {
    return new Call().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Call {
    return new Call().fromJsonString(jsonString, options);
  }

  static equals(a: Call | PlainMessage<Call> | undefined, b: Call | PlainMessage<Call> | undefined): boolean {
    return proto2.util.equals(Call, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.Client
 */
export class Client extends Message<Client> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string roomId = 2;
   */
  roomId?: string;

  /**
   * @generated from field: required string callId = 3;
   */
  callId?: string;

  /**
   * @generated from field: required string clientId = 4;
   */
  clientId?: string;

  /**
   * @generated from field: required uint64 joined = 5;
   */
  joined?: bigint;

  /**
   * @generated from field: optional uint64 sampleTouched = 6;
   */
  sampleTouched?: bigint;

  /**
   * @generated from field: optional string timeZoneId = 7;
   */
  timeZoneId?: string;

  /**
   * @generated from field: optional string mediaUnitId = 8;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string userId = 9;
   */
  userId?: string;

  /**
   * @generated from field: optional string marker = 10;
   */
  marker?: string;

  /**
   * @generated from field: repeated string peerConnectionIds = 11;
   */
  peerConnectionIds: string[] = [];

  /**
   * @generated from field: optional org.observertc.schemas.protobuf.Samples.ClientSample.Browser browser = 12;
   */
  browser?: Samples_ClientSample_Browser;

  /**
   * @generated from field: optional org.observertc.schemas.protobuf.Samples.ClientSample.OperationSystem operationSystem = 13;
   */
  operationSystem?: Samples_ClientSample_OperationSystem;

  /**
   * @generated from field: optional org.observertc.schemas.protobuf.Samples.ClientSample.Platform platform = 14;
   */
  platform?: Samples_ClientSample_Platform;

  /**
   * @generated from field: optional org.observertc.schemas.protobuf.Samples.ClientSample.Engine engine = 15;
   */
  engine?: Samples_ClientSample_Engine;

  constructor(data?: PartialMessage<Client>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.Client";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "roomId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "callId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "clientId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "joined", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 6, name: "sampleTouched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 7, name: "timeZoneId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 8, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 9, name: "userId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 10, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 11, name: "peerConnectionIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
    { no: 12, name: "browser", kind: "message", T: Samples_ClientSample_Browser, opt: true },
    { no: 13, name: "operationSystem", kind: "message", T: Samples_ClientSample_OperationSystem, opt: true },
    { no: 14, name: "platform", kind: "message", T: Samples_ClientSample_Platform, opt: true },
    { no: 15, name: "engine", kind: "message", T: Samples_ClientSample_Engine, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Client {
    return new Client().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Client {
    return new Client().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Client {
    return new Client().fromJsonString(jsonString, options);
  }

  static equals(a: Client | PlainMessage<Client> | undefined, b: Client | PlainMessage<Client> | undefined): boolean {
    return proto2.util.equals(Client, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.PeerConnection
 */
export class PeerConnection extends Message<PeerConnection> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string roomId = 2;
   */
  roomId?: string;

  /**
   * @generated from field: required string callId = 3;
   */
  callId?: string;

  /**
   * @generated from field: required string clientId = 4;
   */
  clientId?: string;

  /**
   * @generated from field: required string peerConnectionId = 5;
   */
  peerConnectionId?: string;

  /**
   * @generated from field: required uint64 opened = 6;
   */
  opened?: bigint;

  /**
   * @generated from field: optional string mediaUnitId = 7;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string userId = 8;
   */
  userId?: string;

  /**
   * @generated from field: optional string marker = 9;
   */
  marker?: string;

  /**
   * @generated from field: optional string label = 10;
   */
  label?: string;

  /**
   * @generated from field: repeated string inboundTrackIds = 11;
   */
  inboundTrackIds: string[] = [];

  /**
   * @generated from field: repeated string outboundTrackIds = 12;
   */
  outboundTrackIds: string[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.IceLocalCandidate icelocalCandidates = 13;
   */
  icelocalCandidates: Samples_ClientSample_IceLocalCandidate[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.IceRemoteCandidate iceRemoteCandidates = 14;
   */
  iceRemoteCandidates: Samples_ClientSample_IceRemoteCandidate[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.IceCandidatePair iceCandidatePairs = 15;
   */
  iceCandidatePairs: Samples_ClientSample_IceCandidatePair[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.PeerConnectionTransport transports = 16;
   */
  transports: Samples_ClientSample_PeerConnectionTransport[] = [];

  /**
   * @generated from field: optional uint64 touched = 17;
   */
  touched?: bigint;

  constructor(data?: PartialMessage<PeerConnection>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.PeerConnection";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "roomId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "callId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "clientId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "peerConnectionId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 6, name: "opened", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 7, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 8, name: "userId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 9, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 10, name: "label", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 11, name: "inboundTrackIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
    { no: 12, name: "outboundTrackIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
    { no: 13, name: "icelocalCandidates", kind: "message", T: Samples_ClientSample_IceLocalCandidate, repeated: true },
    { no: 14, name: "iceRemoteCandidates", kind: "message", T: Samples_ClientSample_IceRemoteCandidate, repeated: true },
    { no: 15, name: "iceCandidatePairs", kind: "message", T: Samples_ClientSample_IceCandidatePair, repeated: true },
    { no: 16, name: "transports", kind: "message", T: Samples_ClientSample_PeerConnectionTransport, repeated: true },
    { no: 17, name: "touched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): PeerConnection {
    return new PeerConnection().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): PeerConnection {
    return new PeerConnection().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): PeerConnection {
    return new PeerConnection().fromJsonString(jsonString, options);
  }

  static equals(a: PeerConnection | PlainMessage<PeerConnection> | undefined, b: PeerConnection | PlainMessage<PeerConnection> | undefined): boolean {
    return proto2.util.equals(PeerConnection, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.InboundTrack
 */
export class InboundTrack extends Message<InboundTrack> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string roomId = 2;
   */
  roomId?: string;

  /**
   * @generated from field: required string callId = 3;
   */
  callId?: string;

  /**
   * @generated from field: required string clientId = 4;
   */
  clientId?: string;

  /**
   * @generated from field: required string peerConnectionId = 5;
   */
  peerConnectionId?: string;

  /**
   * @generated from field: required string trackId = 6;
   */
  trackId?: string;

  /**
   * @generated from field: required string kind = 7;
   */
  kind?: string;

  /**
   * @generated from field: required uint64 added = 8;
   */
  added?: bigint;

  /**
   * @generated from field: optional string mediaUnitId = 9;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string userId = 10;
   */
  userId?: string;

  /**
   * @generated from field: optional string marker = 11;
   */
  marker?: string;

  /**
   * @generated from field: optional string sfuSinkId = 12;
   */
  sfuSinkId?: string;

  /**
   * @generated from field: optional string sfuStreamId = 13;
   */
  sfuStreamId?: string;

  /**
   * @generated from field: repeated int64 ssrc = 14;
   */
  ssrc: bigint[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.InboundAudioTrack audioStats = 15;
   */
  audioStats: Samples_ClientSample_InboundAudioTrack[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.InboundVideoTrack videoStats = 16;
   */
  videoStats: Samples_ClientSample_InboundVideoTrack[] = [];

  /**
   * @generated from field: optional uint64 touched = 17;
   */
  touched?: bigint;

  constructor(data?: PartialMessage<InboundTrack>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.InboundTrack";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "roomId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "callId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "clientId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "peerConnectionId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 6, name: "trackId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 7, name: "kind", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 8, name: "added", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 9, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 10, name: "userId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 11, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 12, name: "sfuSinkId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 13, name: "sfuStreamId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 14, name: "ssrc", kind: "scalar", T: 3 /* ScalarType.INT64 */, repeated: true },
    { no: 15, name: "audioStats", kind: "message", T: Samples_ClientSample_InboundAudioTrack, repeated: true },
    { no: 16, name: "videoStats", kind: "message", T: Samples_ClientSample_InboundVideoTrack, repeated: true },
    { no: 17, name: "touched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): InboundTrack {
    return new InboundTrack().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): InboundTrack {
    return new InboundTrack().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): InboundTrack {
    return new InboundTrack().fromJsonString(jsonString, options);
  }

  static equals(a: InboundTrack | PlainMessage<InboundTrack> | undefined, b: InboundTrack | PlainMessage<InboundTrack> | undefined): boolean {
    return proto2.util.equals(InboundTrack, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.OutboundTrack
 */
export class OutboundTrack extends Message<OutboundTrack> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string roomId = 2;
   */
  roomId?: string;

  /**
   * @generated from field: required string callId = 3;
   */
  callId?: string;

  /**
   * @generated from field: required string clientId = 4;
   */
  clientId?: string;

  /**
   * @generated from field: required string peerConnectionId = 5;
   */
  peerConnectionId?: string;

  /**
   * @generated from field: required string trackId = 6;
   */
  trackId?: string;

  /**
   * @generated from field: required uint64 added = 7;
   */
  added?: bigint;

  /**
   * @generated from field: required string kind = 8;
   */
  kind?: string;

  /**
   * @generated from field: optional string mediaUnitId = 9;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string userId = 10;
   */
  userId?: string;

  /**
   * @generated from field: optional string marker = 11;
   */
  marker?: string;

  /**
   * @generated from field: optional string sfuStreamId = 12;
   */
  sfuStreamId?: string;

  /**
   * @generated from field: repeated int64 ssrc = 13;
   */
  ssrc: bigint[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.OutboundAudioTrack audioStats = 14;
   */
  audioStats: Samples_ClientSample_OutboundAudioTrack[] = [];

  /**
   * @generated from field: repeated org.observertc.schemas.protobuf.Samples.ClientSample.OutboundVideoTrack videoStats = 15;
   */
  videoStats: Samples_ClientSample_OutboundVideoTrack[] = [];

  /**
   * @generated from field: optional uint64 touched = 16;
   */
  touched?: bigint;

  constructor(data?: PartialMessage<OutboundTrack>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.OutboundTrack";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "roomId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "callId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "clientId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "peerConnectionId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 6, name: "trackId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 7, name: "added", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 8, name: "kind", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 9, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 10, name: "userId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 11, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 12, name: "sfuStreamId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 13, name: "ssrc", kind: "scalar", T: 3 /* ScalarType.INT64 */, repeated: true },
    { no: 14, name: "audioStats", kind: "message", T: Samples_ClientSample_OutboundAudioTrack, repeated: true },
    { no: 15, name: "videoStats", kind: "message", T: Samples_ClientSample_OutboundVideoTrack, repeated: true },
    { no: 16, name: "touched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): OutboundTrack {
    return new OutboundTrack().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): OutboundTrack {
    return new OutboundTrack().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): OutboundTrack {
    return new OutboundTrack().fromJsonString(jsonString, options);
  }

  static equals(a: OutboundTrack | PlainMessage<OutboundTrack> | undefined, b: OutboundTrack | PlainMessage<OutboundTrack> | undefined): boolean {
    return proto2.util.equals(OutboundTrack, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.Sfu
 */
export class Sfu extends Message<Sfu> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string sfuId = 2;
   */
  sfuId?: string;

  /**
   * @generated from field: required uint64 joined = 3;
   */
  joined?: bigint;

  /**
   * @generated from field: optional uint64 sampleTouched = 4;
   */
  sampleTouched?: bigint;

  /**
   * @generated from field: optional string mediaUnitId = 5;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string timeZoneId = 6;
   */
  timeZoneId?: string;

  /**
   * @generated from field: optional string marker = 7;
   */
  marker?: string;

  /**
   * @generated from field: repeated string sfuTransportIds = 8;
   */
  sfuTransportIds: string[] = [];

  /**
   * @generated from field: optional uint64 serverTouched = 9;
   */
  serverTouched?: bigint;

  constructor(data?: PartialMessage<Sfu>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.Sfu";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "sfuId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "joined", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 4, name: "sampleTouched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 5, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 6, name: "timeZoneId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 7, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 8, name: "sfuTransportIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
    { no: 9, name: "serverTouched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Sfu {
    return new Sfu().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Sfu {
    return new Sfu().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Sfu {
    return new Sfu().fromJsonString(jsonString, options);
  }

  static equals(a: Sfu | PlainMessage<Sfu> | undefined, b: Sfu | PlainMessage<Sfu> | undefined): boolean {
    return proto2.util.equals(Sfu, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.SfuTransport
 */
export class SfuTransport extends Message<SfuTransport> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string sfuId = 2;
   */
  sfuId?: string;

  /**
   * @generated from field: required string transportId = 3;
   */
  transportId?: string;

  /**
   * @generated from field: required bool internal = 4 [default = false];
   */
  internal?: boolean;

  /**
   * @generated from field: required uint64 opened = 5;
   */
  opened?: bigint;

  /**
   * @generated from field: optional uint64 sampleTouched = 6;
   */
  sampleTouched?: bigint;

  /**
   * @generated from field: optional string mediaUnitId = 7;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string marker = 8;
   */
  marker?: string;

  /**
   * @generated from field: repeated string inboundRtpPadIds = 9;
   */
  inboundRtpPadIds: string[] = [];

  /**
   * @generated from field: repeated string outboundRtpPadIds = 10;
   */
  outboundRtpPadIds: string[] = [];

  /**
   * @generated from field: repeated string sctpChannelIds = 11;
   */
  sctpChannelIds: string[] = [];

  /**
   * @generated from field: optional uint64 touched = 12;
   */
  touched?: bigint;

  constructor(data?: PartialMessage<SfuTransport>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.SfuTransport";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "sfuId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "transportId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "internal", kind: "scalar", T: 8 /* ScalarType.BOOL */, default: false },
    { no: 5, name: "opened", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 6, name: "sampleTouched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 7, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 8, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 9, name: "inboundRtpPadIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
    { no: 10, name: "outboundRtpPadIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
    { no: 11, name: "sctpChannelIds", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
    { no: 12, name: "touched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SfuTransport {
    return new SfuTransport().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SfuTransport {
    return new SfuTransport().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SfuTransport {
    return new SfuTransport().fromJsonString(jsonString, options);
  }

  static equals(a: SfuTransport | PlainMessage<SfuTransport> | undefined, b: SfuTransport | PlainMessage<SfuTransport> | undefined): boolean {
    return proto2.util.equals(SfuTransport, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.SfuInboundRtpPad
 */
export class SfuInboundRtpPad extends Message<SfuInboundRtpPad> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string sfuId = 2;
   */
  sfuId?: string;

  /**
   * @generated from field: required string sfuTransportId = 3;
   */
  sfuTransportId?: string;

  /**
   * @generated from field: required string sfuStreamId = 4;
   */
  sfuStreamId?: string;

  /**
   * @generated from field: required string rtpPadId = 5;
   */
  rtpPadId?: string;

  /**
   * @generated from field: required int64 ssrc = 6;
   */
  ssrc?: bigint;

  /**
   * @generated from field: required bool internal = 7 [default = false];
   */
  internal?: boolean;

  /**
   * @generated from field: required uint64 added = 8;
   */
  added?: bigint;

  /**
   * @generated from field: optional uint64 touched = 9;
   */
  touched?: bigint;

  /**
   * @generated from field: optional string mediaUnitId = 10;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string marker = 11;
   */
  marker?: string;

  constructor(data?: PartialMessage<SfuInboundRtpPad>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.SfuInboundRtpPad";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "sfuId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "sfuTransportId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "sfuStreamId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "rtpPadId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 6, name: "ssrc", kind: "scalar", T: 3 /* ScalarType.INT64 */ },
    { no: 7, name: "internal", kind: "scalar", T: 8 /* ScalarType.BOOL */, default: false },
    { no: 8, name: "added", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 9, name: "touched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 10, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 11, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SfuInboundRtpPad {
    return new SfuInboundRtpPad().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SfuInboundRtpPad {
    return new SfuInboundRtpPad().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SfuInboundRtpPad {
    return new SfuInboundRtpPad().fromJsonString(jsonString, options);
  }

  static equals(a: SfuInboundRtpPad | PlainMessage<SfuInboundRtpPad> | undefined, b: SfuInboundRtpPad | PlainMessage<SfuInboundRtpPad> | undefined): boolean {
    return proto2.util.equals(SfuInboundRtpPad, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.SfuOutboundRtpPad
 */
export class SfuOutboundRtpPad extends Message<SfuOutboundRtpPad> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string sfuId = 2;
   */
  sfuId?: string;

  /**
   * @generated from field: required string sfuTransportId = 3;
   */
  sfuTransportId?: string;

  /**
   * @generated from field: required string sfuStreamId = 4;
   */
  sfuStreamId?: string;

  /**
   * @generated from field: required string sfuSinkId = 5;
   */
  sfuSinkId?: string;

  /**
   * @generated from field: required string rtpPadId = 6;
   */
  rtpPadId?: string;

  /**
   * @generated from field: required int64 ssrc = 7;
   */
  ssrc?: bigint;

  /**
   * @generated from field: required bool internal = 8 [default = false];
   */
  internal?: boolean;

  /**
   * @generated from field: required uint64 added = 9;
   */
  added?: bigint;

  /**
   * @generated from field: optional uint64 touched = 10;
   */
  touched?: bigint;

  /**
   * @generated from field: optional string mediaUnitId = 11;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string marker = 12;
   */
  marker?: string;

  constructor(data?: PartialMessage<SfuOutboundRtpPad>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.SfuOutboundRtpPad";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "sfuId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "sfuTransportId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "sfuStreamId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "sfuSinkId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 6, name: "rtpPadId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 7, name: "ssrc", kind: "scalar", T: 3 /* ScalarType.INT64 */ },
    { no: 8, name: "internal", kind: "scalar", T: 8 /* ScalarType.BOOL */, default: false },
    { no: 9, name: "added", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 10, name: "touched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 11, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 12, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SfuOutboundRtpPad {
    return new SfuOutboundRtpPad().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SfuOutboundRtpPad {
    return new SfuOutboundRtpPad().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SfuOutboundRtpPad {
    return new SfuOutboundRtpPad().fromJsonString(jsonString, options);
  }

  static equals(a: SfuOutboundRtpPad | PlainMessage<SfuOutboundRtpPad> | undefined, b: SfuOutboundRtpPad | PlainMessage<SfuOutboundRtpPad> | undefined): boolean {
    return proto2.util.equals(SfuOutboundRtpPad, a, b);
  }
}

/**
 * @generated from message org.observertc.observer.models.SfuSctpChannel
 */
export class SfuSctpChannel extends Message<SfuSctpChannel> {
  /**
   * @generated from field: required string serviceId = 1;
   */
  serviceId?: string;

  /**
   * @generated from field: required string sfuId = 2;
   */
  sfuId?: string;

  /**
   * @generated from field: required string sfuTransportId = 3;
   */
  sfuTransportId?: string;

  /**
   * @generated from field: required string sfuSctpStreamId = 4;
   */
  sfuSctpStreamId?: string;

  /**
   * @generated from field: required string sfuSctpChannelId = 5;
   */
  sfuSctpChannelId?: string;

  /**
   * @generated from field: required uint64 opened = 6;
   */
  opened?: bigint;

  /**
   * @generated from field: optional uint64 touched = 7;
   */
  touched?: bigint;

  /**
   * @generated from field: optional string mediaUnitId = 8;
   */
  mediaUnitId?: string;

  /**
   * @generated from field: optional string marker = 9;
   */
  marker?: string;

  constructor(data?: PartialMessage<SfuSctpChannel>) {
    super();
    proto2.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto2 = proto2;
  static readonly typeName = "org.observertc.observer.models.SfuSctpChannel";
  static readonly fields: FieldList = proto2.util.newFieldList(() => [
    { no: 1, name: "serviceId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "sfuId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "sfuTransportId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "sfuSctpStreamId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "sfuSctpChannelId", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 6, name: "opened", kind: "scalar", T: 4 /* ScalarType.UINT64 */ },
    { no: 7, name: "touched", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 8, name: "mediaUnitId", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 9, name: "marker", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SfuSctpChannel {
    return new SfuSctpChannel().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SfuSctpChannel {
    return new SfuSctpChannel().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SfuSctpChannel {
    return new SfuSctpChannel().fromJsonString(jsonString, options);
  }

  static equals(a: SfuSctpChannel | PlainMessage<SfuSctpChannel> | undefined, b: SfuSctpChannel | PlainMessage<SfuSctpChannel> | undefined): boolean {
    return proto2.util.equals(SfuSctpChannel, a, b);
  }
}

