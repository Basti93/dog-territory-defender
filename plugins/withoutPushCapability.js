// Removes the APNs push entitlement that expo-notifications adds. The app only
// uses local notifications, and personal (free) Apple teams cannot sign builds
// that carry the Push Notifications capability.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushCapability(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
