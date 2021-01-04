import toml
import os
from pathlib import Path

class ConfigParser:

    def __init__(self, config_path):

        self.config_path = config_path

    def __tomlParser(self):

        config = toml.load(self.config_path)

        return config

    def __envParser(self):

        config = {
            "data_sources":{
                "db_path":      os.environ.get('KURATOR_COLLECTION_DB')
            },
            "webapp_settings": {
                "environment":      os.environ.get('KURATOR_APP_ENVIRONMENT'),
                "debug_mode":       os.environ.get('KURATOR_DEBUG_MODE'),
                "secret_key":       os.environ.get('KURATOR_SECRET_KEY'),
                "host":             os.environ.get('KURATOR_HOST'),
                "port":             os.environ.get('KURATOR_PORT'),
                "cors_whitelist":   os.environ.get('KURATOR_CORS_WHITELIST')
            }
        }

        return config

    def loadConfig(self):

        config_file = Path(self.config_path)

        if config_file.is_file():
            return self.__tomlParser()
        else:
            return self.__envParser()