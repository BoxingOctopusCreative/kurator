import pymongo

class DB:

    def __init__(self, db_path):
        self.db_path = db_path

    # Set up database connection
    def get_collection(self):
        my_client = pymongo.MongoClient(self.db_path)
        db = my_client.collection
        my_collection = db.collection

        return my_collection
