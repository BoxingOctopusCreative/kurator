import toml

class ConfigParser:

    def __init__(self, config_path):

        self.config_path = config_path
    
    def tomlParser(self):

        config = toml.load(self.config_path)

        return config

    