import { ICollaborativeObject } from "@prague/api-definitions";
// import * as loader from "@prague/loader";
import { IMap, IMapView, MapExtension } from "@prague/map";
import * as Sequence from "@prague/sequence";
import * as uuid from "uuid/v4";
import * as intelligence from "../../intelligence";
import { RateLimiter } from "../rateLimiter";
import { runAfterWait } from "../utils";

// 5s wait time between intelligent service calls
const defaultWaitTime = 10 * 1000;

export class IntelligentServicesManager {
    private services: intelligence.IIntelligentService[] = [];
    private rateLimiter: RateLimiter;
    private intelInvoked: boolean = false;

    constructor(
        private doc, // loader.Document,
        private documentInsights: IMapView) {}

    /**
     * Registers a new intelligent service
     */
    public registerService(service: intelligence.IIntelligentService) {
        this.services.push(service);
    }

    public process(object: ICollaborativeObject) {
        // TODO expose way for intelligent services to express their supported document types
        if (object.type === Sequence.CollaborativeStringExtension.Type) {
            if (!this.intelInvoked) {
                const sharedString = object as Sequence.SharedString;

                // And then run plugin insights rate limited
                this.rateLimiter = new RateLimiter(
                    async () => {
                        // Create a map for the object if it doesn't exist yet
                        if (!this.documentInsights.has(object.id)) {
                            const objectMap = this.doc.runtime.createChannel(uuid(), MapExtension.Type);
                            this.documentInsights.set(object.id, objectMap);
                        }

                        const output = this.documentInsights.get(object.id) as IMap;

                        // Run the collaborative services
                        const text = sharedString.client.getText();
                        const setInsightsP = this.services.map(async (service) => {
                            const result = await service.run(text);
                            return output.set(service.name, result);
                        });
                        return Promise.all(setInsightsP);
                    },
                    defaultWaitTime);
                this.intelInvoked = true;
            }
            this.rateLimiter.trigger();
        }
    }

    public async stop() {
        if (this.rateLimiter) {
            await runAfterWait(
                this.rateLimiter.isRunning,
                this.rateLimiter,
                "done",
                async () => {
                    this.rateLimiter.stop();
                });
        }
    }
}
