/**
 * @module can-connect/data/memory-cache/memory-cache memory-cache
 * @parent can-connect.behaviors
 * @group can-connect/data/memory-cache/memory-cache.data-methods data methods
 *
 * Saves raw data in JavaScript memory that disappears when the page refreshes.
 *
 * @signature `memoryCache( baseConnection )`
 *
 *   Creates a cache of instances and a cache of sets of instances that is
 *   accessible to read via [can-connect/data/memory-cache/memory-cache.getSets],
 *   [can-connect/data/memory-cache/memory-cache.getData], and [can-connect/data/memory-cache/memory-cache.getListData].
 *   The caches are updated via [can-connect/data/memory-cache/memory-cache.createData],
 *   [can-connect/data/memory-cache/memory-cache.updateData], [can-connect/data/memory-cache/memory-cache.destroyData],
 *   and [can-connect/data/memory-cache/memory-cache.updateListData].
 *
 *   [can-connect/data/memory-cache/memory-cache.createData],
 *   [can-connect/data/memory-cache/memory-cache.updateData],
 *   [can-connect/data/memory-cache/memory-cache.destroyData] are able to move items in and out
 *   of sets.
 *
 * @body
 *
 * ## Use
 *
 * `data/memory-cache` is often used with a caching strategy like [can-connect/fall-through-cache/fall-through-cache] or
 * [can-connect/cache-requests/cache-requests].
 *
 * ```js
 * var cacheConnection = connect([
 *   require("can-connect/data/memory-cache/memory-cache")
 * ],{});
 *
 * var todoConnection = connect([
 *   require("can-connect/data/url/url"),
 *   require("can-connect/fall-through-cache/fall-through-cache")
 * ],
 * {
 *   url: "/services/todos",
 *   cacheConnection: cacheConnection
 * });
 * ```
 */
var canReflect = require("can-reflect");
var sortObject = require("can-sort-object");
var updateExceptId = require("can-query/helpers/update-except-id");
var setAdd = require("can-query/helpers/insert");
var indexOf = require("can-query/helpers/index-by-id");


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

		__getListData: function(set){
			var setsData = this.getSetData();
			var setData = setsData[JSON.stringify(sortObject(set))];
			if(setData) {
				return setData.items;
			}
		},
		_instances: {},
		getInstance: function(id){
			return this._instances[id];
		},
		getInstanceFromProps: function(props) {
			var id = this.algebra.id(props);
			return this.getInstance(id);
		},
		removeSet: function(setKey, noUpdate) {
			var sets = this.getSetData();
			delete sets[setKey];
			if(noUpdate !== true) {
				this.updateSets();
			}
		},
		updateSets: function(){ },

		updateInstance: function(props) {
			var instance = this.getInstanceFromProps(props);
			if(instance) {
				updateExceptId(this.algebra, instance, props);
			} else {
				var id = this.algebra.id(props);
				instance = this._instances[id] = props;
			}
			return instance;
		},
		// Updates a set
		updateSet: function(setDatum, items, newSet) {
			var newSetKey = newSet ? JSON.stringify(sortObject(newSet)) : setDatum.setKey;
			if(newSet) {
				// if the setKey is changing
				if(newSetKey !== setDatum.setKey) {
					// add the new one
					var sets = this.getSetData();
					var oldSetKey = setDatum.setKey;
					sets[newSetKey] = setDatum;
					setDatum.setKey = newSetKey;
					setDatum.set = canReflect.assignMap({},newSet);
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
		addSet: function(set, data) {
			var items = getItems(data);
			var sets = this.getSetData();
			var setKey = JSON.stringify(sortObject(set));

			sets[setKey] = {
				setKey: setKey,
				items: items,
				set: canReflect.assignMap({},set)
			};

			var self = this;

			items.forEach(function(item){
				self.updateInstance(item);
			});
			this.updateSets();
		},
		_eachSet: function(cb){
			var sets = this.getSetData();
			var self = this;
			var loop = function(setDatum, setKey) {
				return cb.call(self, setDatum, setKey, function(){
					return setDatum.items;

				});
			};

			for(var setKey in sets) {
				var setDatum = sets[setKey];
				var result = loop(setDatum, setKey);
				if(result !== undefined) {
					return result;
				}
			}
		},
		_getSets: function(){
			var sets = [],
				setsData = this.getSetData();
			for(var prop in setsData) {
				sets.push(setsData[prop].set);
			}
			return sets;
		},
		// ## External interface

		/**
		 * @function can-connect/data/memory-cache/memory-cache.getSets getSets
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
		 *
		 * Returns the sets contained within the cache.
		 *
		 * @signature `connection.getSets()`
		 *
		 *   Returns the sets added by [can-connect/data/memory-cache/memory-cache.updateListData].
		 *
		 *   @return {Promise<Array<can-set/Set>>} A promise that resolves to the list of sets.
		 *
		 * @body
		 *
		 * ## Use
		 *
		 * ```
		 * connection.getSets() //-> Promise( [{type: "completed"},{user: 5}] )
		 * ```
		 *
		 */
		getSets: function(){

			return Promise.resolve(this._getSets());
		},

		/**
		 * @function can-connect/data/memory-cache/memory-cache.clear clear
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
		 *
		 * Resets the memory cache so it contains nothing.
		 *
		 * @signature `connection.clear()`
		 *
		 *   Removes all instances and lists being stored in memory.
		 *
		 *   ```
		 *   var cacheConnection = connect([
		 *     require("can-connect/data/memory-cache/memory-cache")
		 *   ],{});
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
		 * @function can-connect/data/memory-cache/memory-cache.getListData getListData
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
		 *
		 * Gets a set of data from the memory cache.
		 *
		 * @signature `connection.getListData(set)`
		 *
		 *   Goes through each set add by [can-connect/data/memory-cache/memory-cache.updateListData]. If
		 *   `set` is a subset, uses [can-connect/base/base.algebra] to get the data for the requested `set`.
		 *
		 *   @param {can-set/Set} set An object that represents the data to load.
		 *
		 *   @return {Promise<can-connect.listData>} A promise that resolves if `set` is a subset of
		 *   some data added by [can-connect/data/memory-cache/memory-cache.updateListData].  If it is not,
		 *   the promise is rejected.
		 */
		getListData: function(set){
			set = set || {};
			var listData = this.getListDataSync(set);
			if(listData) {
				return Promise.resolve(listData);
			}
			return Promise.reject({
				title: "no data",
				status: "404",
				detail: "No data available for this set.\nAvailable sets: "+
					JSON.stringify(this._getSets())
			});

		},
		/**
		 * @function can-connect/data/memory-cache.getListDataSync getListDataSync
		 * @parent can-connect/data/memory-cache.data-methods
		 *
		 * Synchronously gets a set of data from the memory cache.
		 *
		 * @signature `connection.getListDataSync(set)`
		 * @hide
		 */
		getListDataSync: function(set){
			var sets = this._getSets();
			for(var i = 0; i < sets.length; i++) {
				var checkSet = sets[i];

				if( this.algebra.subset(set, checkSet) ) {
					var source = this.__getListData(checkSet);
					return this.algebra.getMembersAndCountFrom(set, checkSet, source);
				}
			}
		},
		// a sync method used by can-fixture.
		_getListData: function(set){
			return this.getListDataSync(set);
		},
		/**
		 * @function can-connect/data/memory-cache/memory-cache.updateListData updateListData
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
		 *
		 * Saves a set of data in the cache.
		 *
		 * @signature `connection.updateListData(listData, set)`
		 *
		 *   Tries to merge this set of data with any other saved sets of data. If
		 *   unable to merge this data, saves the set by itself.
		 *
		 *   @param {can-connect.listData} listData The data that belongs to `set`.
		 *   @param {can-set/Set} set The set `listData` belongs to.
		 *   @return {Promise} Promise resolves if and when the data has been successfully saved.
		 */
		updateListData: function(data, set){
			set = set || {};

			var clonedData = canReflect.serialize(data);
			var items = getItems(clonedData);
			var sets = this.getSetData();
			var self = this;

			for(var setKey in sets) {
				var setDatum = sets[setKey];
				var union = this.algebra.union(setDatum.set, set);
				if( this.algebra.isDefinedAndHasMembers(union) ) {
					// copies so we don't pass the same set object
					var getSet = canReflect.assignMap({},setDatum.set);
					return this.getListData(getSet).then(function(setData){

						self.updateSet(setDatum, self.algebra.getUnion(getSet, set, getItems(setData), items ), union);
					});
				}
			}

			this.addSet(set, clonedData);
			// setData.push({set: set, items: data});
			return Promise.resolve();
		},

		/**
		 * @function can-connect/data/memory-cache/memory-cache.getData getData
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
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
			var id = this.algebra.id(params);
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
		 * @function can-connect/data/memory-cache/memory-cache.createData createData
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
		 *
		 * Called when an instance is created and should be added to cache.
		 *
		 * @signature `connection.createData(props)`
		 *
		 *   Adds `props` to the stored list of instances. Then, goes
		 *   through every set and adds props the sets it belongs to.
		 */
		createData: function(props){
			var self = this;
			var instance = this.updateInstance(props);

			this._eachSet(function(setDatum, setKey, getItems){
				if(this.algebra.has(setDatum.set, instance )) {
					self.updateSet(setDatum, setAdd(self.algebra, setDatum.set,  getItems(), instance), setDatum.set);
				}
			});

			return Promise.resolve(canReflect.assignMap({},instance));
		},

		/**
		 * @function can-connect/data/memory-cache/memory-cache.updateData updateData
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
		 *
		 * Called when an instance is updated.
		 *
		 * @signature `connection.updateData(props)`
		 *
		 *   Overwrites the stored instance with the new props. Then, goes
		 *   through every set and adds or removes the instance if it belongs or not.
		 */
		updateData: function(props){
			var self = this;

			if(this.errorOnMissingRecord && !this.getInstanceFromProps(props)) {
				var id = this.algebra.id(props);
				return Promise.reject({
					title: "no data",
					status: "404",
					detail: "No record with matching identity ("+id+")."
				});
			}
			var instance = this.updateInstance(props);

			// for now go through every set, if this belongs, add it or update it, otherwise remove it
			this._eachSet(function(setDatum, setKey, getItems){
				// if props belongs
				var items = getItems();
				var index = indexOf(self.algebra, instance, items);

				if( this.algebra.subset(instance, setDatum.set) ) {

					// if it's not in, add it
					if(index === -1) {
						// how to insert things together?

						self.updateSet(setDatum, setAdd(self.algebra, setDatum.set,  getItems(), instance, self.algebra) );
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
		 * @function can-connect/data/memory-cache/memory-cache.destroyData destroyData
		 * @parent can-connect/data/memory-cache/memory-cache.data-methods
		 *
		 * Called when an instance should be removed from the cache.
		 *
		 * @signature `connection.destroyData(props)`
		 *
		 *   Goes through each set of data and removes any data that matches
		 *   `props`'s [can-connect/base/base.id]. Finally removes this from the instance store.
		 */
		destroyData: function(props){

			if(this.errorOnMissingRecord && !this.getInstanceFromProps(props)) {
				var id = this.algebra.id(props);
				return Promise.reject({
					title: "no data",
					status: "404",
					detail: "No record with matching identity ("+id+")."
				});
			}

			var self = this;

			this._eachSet(function(setDatum, setKey, getItems){
				// if props belongs
				var items = getItems();
				var index = indexOf(self.algebra, props, items);

				if(index !== -1){
					// otherwise remove it
					items.splice(index,1);
					self.updateSet(setDatum, items);
				}
			});
			var id = this.algebra.id(props);
			delete this._instances[id];
			return Promise.resolve(canReflect.assignMap({},props));
		}
	});

	return behavior;

};
