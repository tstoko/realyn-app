import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
/**
 * Adyen webhook handler
 */
declare function adyenWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit>;
export default adyenWebhook;
//# sourceMappingURL=adyenWebhook.d.ts.map