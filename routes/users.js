var User = require('../models/user');
var Task = require('../models/task');

module.exports = function(router) {
    var usersRoute = router.route('/users');

    usersRoute.get(function(req, res) {
        var q = User.find({});
        if (req.query.where) {
            q = q.where(JSON.parse(req.query.where));
        }
        if (req.query.sort) {
            q = q.sort(JSON.parse(req.query.sort));
        }
        if (req.query.select) {
            q = q.select(JSON.parse(req.query.select));
        }
        if (req.query.skip) {
            q = q.skip(parseInt(req.query.skip));
        }
        if (req.query.limit) {
            q = q.limit(parseInt(req.query.limit));
        }
        if (req.query.count) {
            q.countDocuments(function(err, cnt) {
                if (err) {
                    return res.status(500).json({message: 'Error counting users', data: {}});
                }
                return res.status(200).json({message: 'OK', data: cnt});
            });
        } else {
            q.exec(function(err, users) {
                if (err) {
                    return res.status(500).json({message: 'Error getting users', data: {}});
                }
                return res.status(200).json({message: 'OK', data: users});
            });
        }
    });

    usersRoute.post(function(req, res) {
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({message: 'Name and email required', data: {}});
        }
        var u = new User();
        u.name = req.body.name;
        u.email = req.body.email;
        u.pendingTasks = req.body.pendingTasks || [];
        u.save(function(err) {
            if (err) {
                if (err.code === 11000) {
                    return res.status(400).json({message: 'Email already exists', data: {}});
                }
                return res.status(500).json({message: 'Error creating user', data: {}});
            }
            return res.status(201).json({message: 'User created', data: u});
        });
    });

    var userRoute = router.route('/users/:id');

    userRoute.get(function(req, res) {
        var q = User.findById(req.params.id);
        if (req.query.select) {
            q = q.select(JSON.parse(req.query.select));
        }
        q.exec(function(err, u) {
            if (err || !u) {
                return res.status(404).json({message: 'User not found', data: {}});
            }
            return res.status(200).json({message: 'OK', data: u});
        });
    });

    userRoute.put(function(req, res) {
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({message: 'Name and email required', data: {}});
        }
        User.findById(req.params.id, function(err, u) {
            if (err || !u) {
                return res.status(404).json({message: 'User not found', data: {}});
            }
            var oldTasks = u.pendingTasks || [];
            u.name = req.body.name;
            u.email = req.body.email;
            u.pendingTasks = req.body.pendingTasks || [];
            u.save(function(err) {
                if (err) {
                    if (err.code === 11000) {
                        return res.status(400).json({message: 'Email already exists', data: {}});
                    }
                    return res.status(500).json({message: 'Error updating user', data: {}});
                }
                var tasksToRemove = oldTasks.filter(t => !u.pendingTasks.includes(t));
                var tasksToAdd = u.pendingTasks.filter(t => !oldTasks.includes(t));
                
                var pendingOps = tasksToRemove.length + tasksToAdd.length;
                var opsCompleted = 0;
                
                function checkComplete() {
                    opsCompleted++;
                    if (opsCompleted === pendingOps) {
                        return res.status(200).json({message: 'User updated', data: u});
                    }
                }
                
                if (pendingOps === 0) {
                    return res.status(200).json({message: 'User updated', data: u});
                }
                
                tasksToRemove.forEach(function(tid) {
                    Task.findById(tid, function(e, t) {
                        if (!e && t) {
                            t.assignedUser = "";
                            t.assignedUserName = "unassigned";
                            t.save(function() {
                                checkComplete();
                            });
                        } else {
                            checkComplete();
                        }
                    });
                });
                tasksToAdd.forEach(function(tid) {
                    Task.findById(tid, function(e, t) {
                        if (!e && t) {
                            t.assignedUser = u._id.toString();
                            t.assignedUserName = u.name;
                            t.save(function() {
                                checkComplete();
                            });
                        } else {
                            checkComplete();
                        }
                    });
                });
            });
        });
    });

    userRoute.delete(function(req, res) {
        User.findByIdAndRemove(req.params.id, function(err, u) {
            if (err || !u) {
                return res.status(404).json({message: 'User not found', data: {}});
            }
            if (u.pendingTasks && u.pendingTasks.length > 0) {
                var pendingOps = u.pendingTasks.length;
                var opsCompleted = 0;
                
                function checkComplete() {
                    opsCompleted++;
                    if (opsCompleted === pendingOps) {
                        return res.status(200).json({message: 'User deleted', data: u});
                    }
                }
                
                u.pendingTasks.forEach(function(tid) {
                    Task.findById(tid, function(e, t) {
                        if (!e && t) {
                            t.assignedUser = "";
                            t.assignedUserName = "unassigned";
                            t.save(function() {
                                checkComplete();
                            });
                        } else {
                            checkComplete();
                        }
                    });
                });
            } else {
                return res.status(200).json({message: 'User deleted', data: u});
            }
        });
    });

    return router;
};

