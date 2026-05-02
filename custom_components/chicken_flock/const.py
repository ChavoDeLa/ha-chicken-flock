"""Constants for the Chicken Flock integration."""

DOMAIN = "chicken_flock"
STORAGE_KEY = "chicken_flock_data"
STORAGE_VERSION = 1

# Chicken profile keys
ATTR_NAME = "name"
ATTR_BREED = "breed"
ATTR_SEX = "sex"
ATTR_BIRTHDATE = "birthdate"
ATTR_DEATHDATE = "deathdate"
ATTR_ACTIVE = "active"
ATTR_TRACK_EGGS = "track_eggs"
ATTR_NOTES = "notes"
ATTR_CHICKEN_ID = "chicken_id"

# Sex options
SEX_HEN = "hen"
SEX_ROOSTER = "rooster"
SEX_OPTIONS = [SEX_HEN, SEX_ROOSTER]

# Entity naming
COUNTER_ENTITY_PREFIX = "counter.flock_"
COUNTER_ENTITY_SUFFIX = "_eggs"

# Services
SERVICE_ADD_CHICKEN = "add_chicken"
SERVICE_UPDATE_CHICKEN = "update_chicken"
SERVICE_REMOVE_CHICKEN = "remove_chicken"
SERVICE_RESET_DAILY_COUNTS = "reset_daily_counts"

# Button platform
BUTTON_RESET = "reset_daily_counts"

SERVICE_IMPORT_MEMBERS = "import_members"
SERVICE_IMPORT_HISTORY = "import_history"

SERVICE_DEDUPLICATE = "deduplicate_flock"

SERVICE_CLEAR_ALL = "clear_all_data"

SERVICE_UPLOAD_PHOTO = "upload_photo"
SERVICE_DELETE_PHOTO = "delete_photo"

SERVICE_UPLOAD_EGG_PHOTO = "upload_egg_photo"
SERVICE_DELETE_EGG_PHOTO = "delete_egg_photo"

SERVICE_EDIT_HISTORY = "edit_history"
