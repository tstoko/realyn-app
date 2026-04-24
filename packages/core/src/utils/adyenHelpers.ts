import * as crypto from "crypto";
import { getOrganizationByAdyenMerchant } from "../services/organizationService";

/**
 * Calculate Adyen HMAC signature
 */
export function calculateAdyenHMAC(
  notification: any,
  webhookPassword: string
): string {
  const notificationRequestItem = notification.notificationItems?.[0]?.NotificationRequestItem;
  if (!notificationRequestItem) {
    throw new Error("Invalid Adyen notification format");
  }

  const dataToSign = [
    notificationRequestItem.pspReference,
    notificationRequestItem.originalReference || "",
    notificationRequestItem.merchantAccountCode,
    notificationRequestItem.merchantReference || "",
    notificationRequestItem.amount?.value?.toString() || "",
    notificationRequestItem.amount?.currency || "",
    notificationRequestItem.eventCode,
    notificationRequestItem.success === true ? "true" : "false",
  ].join(":");

  return crypto
    .createHmac("sha256", webhookPassword)
    .update(dataToSign)
    .digest("base64");
}

/**
 * Verify Adyen webhook signature
 */
export function verifyAdyenSignature(
  notification: any,
  hmacSignature: string,
  webhookPassword: string
): boolean {
  try {
    const calculatedSignature = calculateAdyenHMAC(notification, webhookPassword);
    return calculatedSignature === hmacSignature;
  } catch (error) {
    console.error("Error verifying Adyen signature:", error);
    return false;
  }
}

/**
 * Get organization from Adyen notification
 */
export async function getOrganizationFromAdyenNotification(
  notification: any
): Promise<{ organizationId: string; webhookPassword: string } | null> {
  const merchantAccount = notification.notificationItems?.[0]?.NotificationRequestItem?.merchantAccountCode;
  
  if (!merchantAccount) {
    console.error("Adyen: No merchant account in notification");
    return null;
  }

  console.log(`Adyen: Looking up organization for merchant account: ${merchantAccount}`);
  const organization = await getOrganizationByAdyenMerchant(merchantAccount);
  
  if (!organization) {
    console.error(`Adyen: Organization not found for merchant: ${merchantAccount}`);
    return null;
  }

  console.log(`Adyen: Found organization: ${organization.id} (${organization.name || 'unnamed'})`);

  const adyenIntegration = organization.pspIntegrations?.adyen;
  if (!adyenIntegration) {
    console.error(`Adyen: No Adyen integration configured for organization: ${organization.id}`);
    return null;
  }

  if (adyenIntegration.status !== "connected") {
    console.error(`Adyen: Integration not connected (status: ${adyenIntegration.status}) for organization: ${organization.id}`);
    return null;
  }

  if (!adyenIntegration.webhookPassword) {
    console.error(`Adyen: Missing webhook password for organization: ${organization.id}`);
    return null;
  }

  const webhookPassword = adyenIntegration.webhookPassword;

  return {
    organizationId: organization.id,
    webhookPassword,
  };
}

