interface DeliveryInput {
  resourceType: string;
  resourceId: string;
  channel: "email" | "push" | "in-app";
  body?: string;
}

export function createDeliveryMetadata(input: DeliveryInput) {
  return { resourceType: input.resourceType, resourceId: input.resourceId, channel: input.channel };
}
