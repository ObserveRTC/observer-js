import { ObserverStorage } from "./ObserverStorage";
import * as Models from '../models/Models';
import { SimpleStorage } from "./SimpleStorage";

export interface StorageFactory {
	createCallStorage(): Promise<ObserverStorage<string, Models.Call>>;
	createClientStorage(): Promise<ObserverStorage<string, Models.Client>>;
	createPeerConnectionStorage(): Promise<ObserverStorage<string, Models.PeerConnection>>;
	createInboundTrackStorage(): Promise<ObserverStorage<string, Models.InboundTrack>>;
	createOutboundTrackStorage(): Promise<ObserverStorage<string, Models.OutboundTrack>>;
	createSfuStorage(): Promise<ObserverStorage<string, Models.Sfu>>;
	createSfuTransportStorage(): Promise<ObserverStorage<string, Models.SfuTransport>>;
	createSfuInboundRtpPadStorage(): Promise<ObserverStorage<string, Models.SfuInboundRtpPad>>;
	createSfuOutboundRtpPadStorage(): Promise<ObserverStorage<string, Models.SfuOutboundRtpPad>>;
	createSfuSctpChannelStorage(): Promise<ObserverStorage<string, Models.SfuSctpChannel>>;
  }
  
  export class MapBasedStorageFactory implements StorageFactory {
	public async createCallStorage(): Promise<ObserverStorage<string, Models.Call>> {
	  return new SimpleStorage<string, Models.Call>('ObserverCallStorage');
	}
  
	public async createClientStorage(): Promise<ObserverStorage<string, Models.Client>> {
	  return new SimpleStorage<string, Models.Client>('ObserverClientStorage');
	}
  
	public async createPeerConnectionStorage(): Promise<ObserverStorage<string, Models.PeerConnection>> {
	  return new SimpleStorage<string, Models.PeerConnection>('ObserverPeerConnectionStorage');
	}
  
	public async createInboundTrackStorage(): Promise<ObserverStorage<string, Models.InboundTrack>> {
	  return new SimpleStorage<string, Models.InboundTrack>('ObserverInboundTrackStorage');
	}
  
	public async createOutboundTrackStorage(): Promise<ObserverStorage<string, Models.OutboundTrack>> {
	  return new SimpleStorage<string, Models.OutboundTrack>('ObserverOutboundTrackStorage');
	}
  
	public async createSfuStorage(): Promise<ObserverStorage<string, Models.Sfu>> {
	  return new SimpleStorage<string, Models.Sfu>('ObserverSfuStorage');
	}
  
	public async createSfuTransportStorage(): Promise<ObserverStorage<string, Models.SfuTransport>> {
	  return new SimpleStorage<string, Models.SfuTransport>('ObserverSfuTransportStorage');
	}
  
	public async createSfuInboundRtpPadStorage(): Promise<ObserverStorage<string, Models.SfuInboundRtpPad>> {
	  return new SimpleStorage<string, Models.SfuInboundRtpPad>('ObserverSfuInboundRtpPadStorage');
	}
  
	public async createSfuOutboundRtpPadStorage(): Promise<ObserverStorage<string, Models.SfuOutboundRtpPad>> {
	  return new SimpleStorage<string, Models.SfuOutboundRtpPad>('ObserverSfuOutboundRtpPadStorage');
	}
  
	public async createSfuSctpChannelStorage(): Promise<ObserverStorage<string, Models.SfuSctpChannel>> {
	  return new SimpleStorage<string, Models.SfuSctpChannel>('ObserverSfuSctpChannelStorage');
	}
  }
  