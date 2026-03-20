import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
/**
 * Stripe webhook handler
 * Receives dispute events from Stripe and updates Cosmos DB
 */
declare function stripeWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit>;
export default stripeWebhook;
//# sourceMappingURL=stripeWebhook.d.ts.map