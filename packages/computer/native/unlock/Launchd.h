#include <servers/bootstrap.h>

static inline kern_return_t botharness_unlock_check_in(mach_port_t *service) {
  return bootstrap_check_in(bootstrap_port, "com.botharness.computer-unlock", service);
}
