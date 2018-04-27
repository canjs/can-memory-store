var canReflect = require("can-reflect");
var sortObject = require("can-sort-object");
var updateExceptId = require("can-diff/update-deep-except-identity/update-deep-except-identity");
var indexOf = require("can-diff/index-by-identity/index-by-identity");


function getItems(data){
	if(Array.isArray(data)) {
		return data;
	} else {
		return data.data;
	}
}


module.exports = function memoryStore(baseConnection){
    baseConnection.constructor = memoryStore;
    var behavior = Object.create(baseConnection);
    canReflect.assignMap(behavior, {
		_sets: {},
		getSetData: function(){
			return this._sets;
		},

		__getListData: function(query){
			var setsData = this.getSetData();
			var setData = setsData[JSON.stringify(sortObject(query))];
			if(setData) {
				return setData.items;
			}
		},
		_instances: {},
		getInstance: function(id){
			return this._instances[id];
		},
		getInstanceFromProps: function(record) {
			var id = canReflect.getIdentity(record, this.queryLogic.schema);
			return this.getInstance(id);
		},
		removeSet: function(setKey, noUpdate) {
			var queries = this.getSetData();
			delete queries[setKey];
			if(noUpdate !== true) {
				this.updateSets();
			}
		},
		updateSets: function(){ },

		updateInstance: function(record) {
			var instance = this.getInstanceFromProps(record);
			if(instance) {
				updateExceptId(instance, record, this.queryLogic.schema);
			} else {
				var id = canReflect.getIdentity(record, this.queryLogic.schema);
				instance = this._instances[id] = record;
			}
			return instance;
		},
		// Updates a query
		updateSet: function(setDatum, items, newSet) {
			var newSetKey = newSet ? JSON.stringify(sortObject(newSet)) : setDatum.setKey;
			if(newSet) {
				// if the setKey is changing
				if(newSetKey !== setDatum.setKey) {
					// add the new one
					var queries = this.getSetData();
					var oldSetKey = setDatum.setKey;
					queries[newSetKey] = setDatum;
					setDatum.setKey = newSetKey;
					setDatum.query = canReflect.assignMap({},newSet);
					// remove the old one
					this.removeSet(oldSetKey);
				}
			}


			setDatum.items = items;
			// save objects and ids
			var self = this;

			items.forEach(function(item){
				self.updateInstance(item);
			});
		},
		addSet: function(query, data) {
			var items = getItems(data);
			var queries = this.getSetData();
			var setKey = JSON.stringify(sortObject(query));

			queries[setKey] = {
				setKey: setKey,
				items: items,
				query: canReflect.assignMap({},query)
			};

			var self = this;

			items.forEach(function(item){
				self.updateInstance(item);
			});
			this.updateSets();
		},
		_eachSet: function(cb){
			var queries = this.getSetData();
			var self = this;
			var loop = function(setDatum, setKey) {
				return cb.call(self, setDatum, setKey, function(){
					return setDatum.items;

				});
			};

			for(var setKey in queries) {
				var setDatum = queries[setKey];
				var result = loop(setDatum, setKey);
				if(result !== undefined) {
					return result;
				}
			}
		},
		_getSets: function(){
			var queries = [],
				setsData = this.getSetData();
			for(var prop in setsData) {
				queries.push(setsData[prop].query);
			}
			return queries;
		},
		// ## External interface

		/**
		 * @function can-memory-store.getQueries getQueries
		 * @parent can-memory-store.data-methods
		 *
		 * Returns the queries contained within the cache.
		 *
		 * @signature `connection.getQueries()`
		 *
		 *   Returns the queries added by [can-memory-store.updateListData].
		 *
		 *   @return {Promise<Array<can-query-logic/query>>} A promise that resolves to the list of queries.
		 *
		 * @body
		 *
		 * ## Use
		 *
		 * ```js
		 * connection.getSets() //-> Promise( [{type: "completed"},{user: 5}] )
		 * ```
		 *
		 */
		getSets: function(){

			return this.getQueries();
		},
		getQueries: function(){
			return Promise.resolve(this._getSets());
		},
		/**
		 * @function can-memory-store.clear clear
		 * @parent can-memory-store.data-methods
		 *
		 * Resets the memory store so it contains nothing.
		 *
		 * @signature `connection.clear()`
		 *
		 *   Removes all instances and lists being stored in memory.
		 *
		 *   ```js
		 *   memoryStore({queryLogic: new QueryLogic()});
		 *
		 *   cacheConnection.updateInstance({id: 5, name: "justin"});
		 *
		 *   cacheConnection.getData({id: 5}).then(function(data){
		 *     data //-> {id: 5, name: "justin"}
		 *     cacheConnection.clear();
		 *     cacheConnection.getData({id: 5}).catch(function(err){
		 *       err -> {message: "no data", error: 404}
		 *     });
		 *   });
		 *   ```
		 *
		 */
		clear: function(){
			this._instances = {};
			this._sets = {};
		},
		/**
		 * @function can-memory-store.getListData getListData
		 * @parent can-memory-store.data-methods
		 *
		 * Gets a list of data from the memory store.
		 *
		 * @signature `connection.getListData(query)`
		 *
		 *   Goes through each query add by [can-memory-store.updateListData]. If
		 *   `query` is a subset, uses [can-connect/base/base.queryLogic] to get the data for the requested `query`.
		 *
		 *   @param {can-query-logic/query} query An object that represents the data to load.
		 *
		 *   @return {Promise<can-connect.listData>} A promise that resolves if `query` is a subset of
		 *   some data added by [can-memory-store.updateListData].  If it is not,
		 *   the promise is rejected.
		 */
		getListData: function(query){
			query = query || {};
			var listData = this.getListDataSync(query);
			if(listData) {
				return Promise.resolve(listData);
			}
			return Promise.reject({
				title: "no data",
				status: "404",
				detail: "No data available for this query.\nAvailable queries: "+
					JSON.stringify(this._getSets())
			});

		},
		/**
		 * @function can-connect/data/memory-cache.getListDataSync getListDataSync
		 * @parent can-connect/data/memory-cache.data-methods
		 *
		 * Synchronously gets a query of data from the memory cache.
		 *
		 * @signature `connection.getListDataSync(query)`
		 * @hide
		 */
		getListDataSync: function(query){
			var queries = this._getSets();
			for(var i = 0; i < queries.length; i++) {
				var checkSet = queries[i];

				if( this.queryLogic.isSubset(query, checkSet) ) {
					var source = this.__getListData(checkSet);
					return this.queryLogic.filterMembersAndGetCount(query, checkSet, source);
				}
			}
		},
		// a sync method used by can-fixture.
		_getListData: function(query){
			return this.getListDataSync(query);
		},
		/**
		 * @function can-memory-store.updateListData updateListData
		 * @parent can-memory-store.data-methods
		 *
		 * Saves a query of data in the cache.
		 *
		 * @signature `connection.updateListData(listData, query)`
		 *
		 *   Tries to merge this query of data with any other saved queries of data. If
		 *   unable to merge this data, saves the query by itself.
		 *
		 *   @param {can-connect.listData} listData The data that belongs to `query`.
		 *   @param {can-query-logic/query} query The query `listData` belongs to.
		 *   @return {Promise} Promise resolves if and when the data has been successfully saved.
		 */
		updateListData: function(data, query){
			query = query || {};

			var clonedData = canReflect.serialize(data);
			var items = getItems(clonedData);
			var queries = this.getSetData();
			var self = this;

			for(var setKey in queries) {
				var setDatum = queries[setKey];
				var union = this.queryLogic.union(setDatum.query, query);
				if( this.queryLogic.isDefinedAndHasMembers(union) ) {
					// copies so we don't pass the same query object
					var getSet = canReflect.assignMap({},setDatum.query);
					return this.getListData(getSet).then(function(setData){

						self.updateSet(setDatum, self.queryLogic.unionMembers(getSet, query, getItems(setData), items ), union);
					});
				}
			}

			this.addSet(query, clonedData);
			// setData.push({query: query, items: data});
			return Promise.resolve();
		},

		/**
		 * @function can-memory-store.getData getData
		 * @parent can-memory-store.data-methods
		 *
		 * Get an instance's data from the memory cache.
		 *
		 * @signature `connection.getData(params)`
		 *
		 *   Looks in the instance store for the requested instance.
		 *
		 *   @param {Object} params An object that should have the [conenction.id] of the element
		 *   being retrieved.
		 *
		 *   @return {Promise} A promise that resolves to the item if the memory cache has this item.
		 *   If the memory cache does not have this item, it rejects the promise.
		 */
		getData: function(params){
			var id = canReflect.getIdentity(params, canReflect.getSchema( this.queryLogic ) );
			var res = this.getInstance(id);
			if(res){
				return Promise.resolve( res );
			} else {
				return Promise.reject({
					title: "no data",
					status: "404",
					detail: "No record with matching identity ("+id+")."
				});
			}
		},



		/**
		 * @function can-memory-store.createData createData
		 * @parent can-memory-store.data-methods
		 *
		 * Called when an instance is created and should be added to cache.
		 *
		 * @signature `connection.createData(record)`
		 *
		 *   Adds `record` to the stored list of instances. Then, goes
		 *   through every query and adds record the queries it belongs to.
		 */
		createData: function(record){
			var self = this;
			var instance = this.updateInstance(record);

			this._eachSet(function(setDatum, setKey, getItems){
				if(this.queryLogic.isMember(setDatum.query, instance )) {
					self.updateSet(setDatum, self.queryLogic.insert( setDatum.query,  getItems(), instance), setDatum.query);
				}
			});

			return Promise.resolve(canReflect.assignMap({},instance));
		},

		/**
		 * @function can-memory-store.updateData updateData
		 * @parent can-memory-store.data-methods
		 *
		 * Called when an instance is updated.
		 *
		 * @signature `connection.updateData(record)`
		 *
		 *   Overwrites the stored instance with the new record. Then, goes
		 *   through every query and adds or removes the instance if it belongs or not.
		 */
		updateData: function(record){
			var self = this;

			if(this.errorOnMissingRecord && !this.getInstanceFromProps(record)) {
				var id = canReflect.getIdentity(record, this.queryLogic.schema);
				return Promise.reject({
					title: "no data",
					status: "404",
					detail: "No record with matching identity ("+id+")."
				});
			}
			var instance = this.updateInstance(record);

			// for now go through every query, if this belongs, add it or update it, otherwise remove it
			this._eachSet(function(setDatum, setKey, getItems){
				// if record belongs
				var items = getItems();
				var index = indexOf(items, instance, self.queryLogic.schema );

				if( this.queryLogic.isSubset(instance, setDatum.query) ) {

					// if it's not in, add it
					if(index === -1) {
						// how to insert things together?

						self.updateSet(setDatum, self.queryLogic.insert( setDatum.query,  getItems(), instance ) );
					} else {
						// otherwise add it
						items.splice(index,1, instance);
						self.updateSet(setDatum, items);
					}

				} else if(index !== -1){
					// otherwise remove it
					items.splice(index,1);
					self.updateSet(setDatum, items);
				}
			});


			return Promise.resolve(canReflect.assignMap({},instance));
		},

		/**
		 * @function can-memory-store.destroyData destroyData
		 * @parent can-memory-store.data-methods
		 *
		 * Called when an instance should be removed from the cache.
		 *
		 * @signature `connection.destroyData(record)`
		 *
		 *   Goes through each query of data and removes any data that matches
		 *   `record`'s [can-connect/base/base.id]. Finally removes this from the instance store.
		 */
		destroyData: function(record){
			var id = canReflect.getIdentity(record,  this.queryLogic.schema);
			if(this.errorOnMissingRecord && !this.getInstanceFromProps(record)) {

				return Promise.reject({
					title: "no data",
					status: "404",
					detail: "No record with matching identity ("+id+")."
				});
			}

			var self = this;

			this._eachSet(function(setDatum, setKey, getItems){
				// if record belongs
				var items = getItems();
				var index = indexOf( items, record, self.queryLogic.schema );

				if(index !== -1){
					// otherwise remove it
					items.splice(index,1);
					self.updateSet(setDatum, items);
				}
			});
			delete this._instances[id];
			return Promise.resolve(canReflect.assignMap({},record));
		}
	});

	return behavior;

};
